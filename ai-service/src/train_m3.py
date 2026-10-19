from __future__ import annotations

import argparse
import gc
import json
import math
import os
from collections import defaultdict
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import normalize

EVENT_WEIGHTS = {"view": 1.0, "addtocart": 3.0, "transaction": 5.0}


def parse_arguments():
    parser = argparse.ArgumentParser(
        description="Train Selbuy M3 hybrid recommendation model."
    )
    parser.add_argument("--data-dir", type=Path, default=Path("data/raw"))
    parser.add_argument("--artifacts-dir", type=Path, default=Path("artifacts"))
    parser.add_argument("--reports-dir", type=Path, default=Path("reports"))
    parser.add_argument("--min-user-events", type=int, default=5)
    parser.add_argument("--min-item-events", type=int, default=5)
    parser.add_argument("--neighbors", type=int, default=30)
    parser.add_argument("--evaluation-users", type=int, default=1000)
    parser.add_argument("--top-k", type=int, default=10)
    parser.add_argument("--random-state", type=int, default=42)
    return parser.parse_args()


def validate_files(data_dir):
    required = [
        data_dir / "events.csv",
        data_dir / "item_properties_part1.csv",
        data_dir / "item_properties_part2.csv",
    ]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise FileNotFoundError(
            "Required dataset files were not found:\n"
            + "\n".join(f"- {path}" for path in missing)
            + "\nPlace the Retailrocket CSV files inside data/raw/."
        )


def load_events(data_dir):
    print("Loading events.csv...")
    events = pd.read_csv(
        data_dir / "events.csv",
        usecols=["timestamp", "visitorid", "event", "itemid"],
        dtype={"event": "string"},
    )
    events = events.dropna(
        subset=["timestamp", "visitorid", "event", "itemid"]
    )
    events["event"] = events["event"].astype(str).str.strip().str.lower()
    events = events[events["event"].isin(EVENT_WEIGHTS)].copy()
    events["weight"] = events["event"].map(EVENT_WEIGHTS).astype("float32")
    events.drop(columns=["event"], inplace=True)
    for column in ["timestamp", "visitorid", "itemid"]:
        events[column] = pd.to_numeric(events[column], errors="coerce")
    events = events.dropna(subset=["timestamp", "visitorid", "itemid"])
    events[["timestamp", "visitorid", "itemid"]] = events[
        ["timestamp", "visitorid", "itemid"]
    ].astype("int64")
    events = events.sort_values(["visitorid", "timestamp"]).reset_index(drop=True)
    print(f"Valid interactions: {len(events):,}")
    print(f"Unique users: {events['visitorid'].nunique():,}")
    print(f"Unique items: {events['itemid'].nunique():,}")
    return events


def iterative_activity_filter(events, min_user_events, min_item_events, rounds=5):
    filtered = events
    for iteration in range(rounds):
        previous_size = len(filtered)
        user_counts = filtered.groupby("visitorid").size()
        valid_users = user_counts[user_counts >= min_user_events].index
        filtered = filtered[filtered["visitorid"].isin(valid_users)]
        item_counts = filtered.groupby("itemid").size()
        valid_items = item_counts[item_counts >= min_item_events].index
        filtered = filtered[filtered["itemid"].isin(valid_items)].reset_index(drop=True)
        print(f"Filtering iteration {iteration + 1}: {len(filtered):,} interactions")
        if len(filtered) == previous_size:
            break
    if filtered.empty:
        raise ValueError("Filtering removed all interactions. Reduce filter values.")
    return filtered


def load_latest_item_categories(data_dir, allowed_item_ids):
    latest_categories = {}
    category_map = {int(item_id): "unknown" for item_id in allowed_item_ids}
    for name in ["item_properties_part1.csv", "item_properties_part2.csv"]:
        print(f"Loading categories from {name}...")
        for part in pd.read_csv(
            data_dir / name,
            usecols=["timestamp", "itemid", "property", "value"],
            dtype={"property": "string", "value": "string"},
            chunksize=250_000,
        ):
            part = part[part["property"] == "categoryid"]
            if part.empty:
                continue
            part = part.copy()
            part["itemid"] = pd.to_numeric(part["itemid"], errors="coerce")
            part["timestamp"] = pd.to_numeric(
                part["timestamp"], errors="coerce"
            )
            part = part.dropna(subset=["timestamp", "itemid", "value"])
            part["itemid"] = part["itemid"].astype("int64")
            part = part[part["itemid"].isin(allowed_item_ids)]
            for row in part.itertuples(index=False):
                item_id = int(row.itemid)
                timestamp = int(row.timestamp)
                current = latest_categories.get(item_id)
                if current is None or timestamp >= current[0]:
                    latest_categories[item_id] = (timestamp, str(row.value))

    for item_id, (_, category) in latest_categories.items():
        category_map[item_id] = category
    known = len(latest_categories)
    print(f"Items with known categories: {known:,}")
    return category_map


def chronological_leave_one_out_split(events):
    events = events.sort_values(["visitorid", "timestamp"]).reset_index(drop=True)
    test_indices = []
    for _, group in events.groupby("visitorid", sort=False):
        if group["itemid"].nunique() >= 2:
            test_indices.append(group.index[-1])
    if not test_indices:
        raise ValueError("No users are eligible for evaluation.")
    test = events.loc[test_indices].copy().reset_index(drop=True)
    train = events.drop(index=test_indices).copy().reset_index(drop=True)
    train_items = set(train["itemid"].unique())
    test = test[test["itemid"].isin(train_items)].reset_index(drop=True)
    eligible_users = set(test["visitorid"].unique())
    train = train[train["visitorid"].isin(eligible_users)].reset_index(drop=True)
    print(f"Training interactions: {len(train):,}")
    print(f"Evaluation interactions: {len(test):,}")
    return train, test


def create_encoders(train):
    user_ids = sorted(map(int, train["visitorid"].unique()))
    item_ids = sorted(map(int, train["itemid"].unique()))
    user_to_index = {value: index for index, value in enumerate(user_ids)}
    item_to_index = {value: index for index, value in enumerate(item_ids)}
    index_to_item = {index: value for value, index in item_to_index.items()}
    return user_ids, item_ids, user_to_index, item_to_index, index_to_item


def build_user_item_matrix(train, user_to_index, item_to_index):
    aggregate = train.groupby(["visitorid", "itemid"], as_index=False)["weight"].sum()
    return csr_matrix(
        (
            aggregate["weight"].astype("float32").to_numpy(),
            (
                aggregate["visitorid"].map(user_to_index).to_numpy(),
                aggregate["itemid"].map(item_to_index).to_numpy(),
            ),
        ),
        shape=(len(user_to_index), len(item_to_index)),
        dtype=np.float32,
    )


def build_user_histories(train):
    aggregate = train.groupby(["visitorid", "itemid"], as_index=False)["weight"].sum()
    histories = defaultdict(list)
    for row in aggregate.itertuples(index=False):
        histories[int(row.visitorid)].append((int(row.itemid), float(row.weight)))
    return dict(histories)


def build_popularity_scores(train, item_ids):
    popularity = train.groupby("itemid")["weight"].sum().to_dict()
    values = np.log1p(
        np.array([float(popularity.get(item_id, 0.0)) for item_id in item_ids])
    )
    if values.size and values.max() > 0:
        values = values / values.max()
    return {int(item_id): float(score) for item_id, score in zip(item_ids, values)}


def build_category_items(item_ids, category_map):
    result = defaultdict(list)
    for item_id in item_ids:
        result[category_map.get(item_id, "unknown")].append(item_id)
    return dict(result)


def precompute_item_neighbors(user_item_matrix, index_to_item, neighbors):
    item_user_matrix = normalize(
        user_item_matrix.T, norm="l2", axis=1, copy=True
    ).tocsr()
    neighbor_count = min(max(neighbors + 1, 2), item_user_matrix.shape[0])
    model = NearestNeighbors(
        n_neighbors=neighbor_count,
        metric="cosine",
        algorithm="brute",
        n_jobs=1,
    )
    model.fit(item_user_matrix)
    neighbor_map = {}
    batch_size = 128
    for start in range(0, item_user_matrix.shape[0], batch_size):
        end = min(start + batch_size, item_user_matrix.shape[0])
        distances, indices = model.kneighbors(
            item_user_matrix[start:end],
            return_distance=True,
        )
        for batch_index, source_index in enumerate(range(start, end)):
            source_item = index_to_item[source_index]
            current = []
            for neighbor_index, distance in zip(
                indices[batch_index], distances[batch_index]
            ):
                neighbor_item = index_to_item[int(neighbor_index)]
                similarity = max(0.0, 1.0 - float(distance))
                if neighbor_item != source_item and similarity > 0:
                    current.append((int(neighbor_item), similarity))
            neighbor_map[int(source_item)] = current
        print(
            f"Computed neighbors for {end:,}/{item_user_matrix.shape[0]:,} items"
        )
    return neighbor_map


def normalize_scores(scores):
    if not scores:
        return {}
    maximum = max(scores.values())
    if maximum <= 0:
        return {item_id: 0.0 for item_id in scores}
    return {item_id: float(score / maximum) for item_id, score in scores.items()}


def recommend_for_user(
    user_id,
    user_histories,
    item_neighbors,
    item_categories,
    category_items,
    popularity_scores,
    top_k=10,
    collaborative_weight=0.55,
    content_weight=0.30,
    popularity_weight=0.15,
):
    history = user_histories.get(int(user_id), [])
    seen_items = {int(item_id) for item_id, _ in history}
    collaborative_scores = defaultdict(float)
    content_scores = defaultdict(float)

    for history_item, interaction_weight in history:
        strength = math.log1p(float(interaction_weight))
        for neighbor_item, similarity in item_neighbors.get(history_item, []):
            if neighbor_item not in seen_items:
                collaborative_scores[neighbor_item] += float(similarity) * strength
        category = item_categories.get(history_item, "unknown")
        if category != "unknown":
            for candidate_item in category_items.get(category, []):
                if candidate_item not in seen_items:
                    content_scores[candidate_item] += strength

    collaborative_scores = normalize_scores(dict(collaborative_scores))
    content_scores = normalize_scores(dict(content_scores))
    candidates = set(collaborative_scores) | set(content_scores) | set(popularity_scores)
    results = []

    for item_id in candidates:
        if item_id in seen_items:
            continue
        collaborative_score = collaborative_scores.get(item_id, 0.0)
        content_score = content_scores.get(item_id, 0.0)
        popularity_score = popularity_scores.get(item_id, 0.0)
        final_score = (
            collaborative_weight * collaborative_score
            + content_weight * content_score
            + popularity_weight * popularity_score
        )
        if not history:
            reason = "Popular product for a new user"
        elif collaborative_score >= content_score and collaborative_score > 0:
            reason = "Similar to products the user previously interacted with"
        elif content_score > 0:
            reason = "Matches categories from the user's interaction history"
        else:
            reason = "Popular product"
        results.append(
            {
                "item_id": int(item_id),
                "score": round(float(final_score), 6),
                "collaborative_score": round(float(collaborative_score), 6),
                "content_score": round(float(content_score), 6),
                "popularity_score": round(float(popularity_score), 6),
                "reason": reason,
            }
        )

    results.sort(
        key=lambda item: (
            -item["score"],
            item["item_id"],
        )
    )
    return results[:top_k]


def average_precision_at_k(recommendations, relevant_items, k):
    relevant_found = 0
    precision_sum = 0.0
    for rank, item_id in enumerate(recommendations[:k], start=1):
        if item_id in relevant_items:
            relevant_found += 1
            precision_sum += relevant_found / rank
    denominator = min(len(relevant_items), k)
    return precision_sum / denominator if denominator else 0.0


def select_evaluation_users(test, maximum_users, random_state):
    ground_truth = (
        test.groupby("visitorid")["itemid"]
        .apply(lambda values: set(map(int, values)))
        .to_dict()
    )
    eligible_users = np.array(sorted(ground_truth), dtype=np.int64)
    if maximum_users > 0 and len(eligible_users) > maximum_users:
        rng = np.random.default_rng(random_state)
        eligible_users = rng.choice(eligible_users, size=maximum_users, replace=False)
    return ground_truth, eligible_users


def evaluate_model(
    test,
    bundle,
    top_k,
    eligible_users,
    weights=None,
):
    ground_truth = (
        test.groupby("visitorid")["itemid"]
        .apply(lambda values: set(map(int, values)))
        .to_dict()
    )
    weights = weights or bundle["weights"]

    precision_values = []
    recall_values = []
    map_values = []
    hit_values = []

    for position, user_id in enumerate(eligible_users, start=1):
        recommendations = recommend_for_user(
            int(user_id),
            bundle["user_histories"],
            bundle["item_neighbors"],
            bundle["item_categories"],
            bundle["category_items"],
            bundle["popularity_scores"],
            top_k,
            weights["collaborative"],
            weights["content"],
            weights["popularity"],
        )
        recommended_ids = [item["item_id"] for item in recommendations]
        relevant = ground_truth[int(user_id)]
        hits = sum(item_id in relevant for item_id in recommended_ids[:top_k])
        precision_values.append(hits / top_k)
        recall_values.append(hits / len(relevant))
        map_values.append(average_precision_at_k(recommended_ids, relevant, top_k))
        hit_values.append(1.0 if hits else 0.0)
        if position % 250 == 0:
            print(f"Evaluated {position:,}/{len(eligible_users):,} users")

    return {
        "k": int(top_k),
        "evaluated_users": int(len(eligible_users)),
        f"precision_at_{top_k}": round(float(np.mean(precision_values)), 6),
        f"recall_at_{top_k}": round(float(np.mean(recall_values)), 6),
        f"map_at_{top_k}": round(float(np.mean(map_values)), 6),
        f"hit_rate_at_{top_k}": round(float(np.mean(hit_values)), 6),
    }


def build_model_bundle(
    train,
    category_map,
    args,
    evaluation=None,
):
    user_ids, item_ids, user_to_index, _, index_to_item = create_encoders(train)
    model_categories = {
        int(item_id): category_map.get(int(item_id), "unknown")
        for item_id in item_ids
    }
    matrix = build_user_item_matrix(
        train,
        user_to_index,
        {item_id: index for index, item_id in enumerate(item_ids)},
    )
    print("User-item matrix shape:", matrix.shape)
    print("User-item non-zero values:", matrix.nnz)
    print("Precomputing collaborative neighbors...")
    item_neighbors = precompute_item_neighbors(
        matrix,
        index_to_item,
        args.neighbors,
    )
    del matrix
    gc.collect()

    bundle = {
        "version": "selbuy-m3-v2",
        "event_weights": EVENT_WEIGHTS,
        "weights": {
            "collaborative": 0.55,
            "content": 0.30,
            "popularity": 0.15,
        },
        "user_ids": user_ids,
        "item_ids": item_ids,
        "user_histories": build_user_histories(train),
        "item_neighbors": item_neighbors,
        "item_categories": model_categories,
        "category_items": build_category_items(
            item_ids,
            model_categories,
        ),
        "popularity_scores": build_popularity_scores(
            train,
            item_ids,
        ),
        "metadata": {
            "training_interactions": int(len(train)),
            "training_users": int(len(user_ids)),
            "training_items": int(len(item_ids)),
            "known_category_items": int(
                sum(
                    value != "unknown"
                    for value in model_categories.values()
                )
            ),
            "minimum_user_events": int(args.min_user_events),
            "minimum_item_events": int(args.min_item_events),
            "neighbors_per_item": int(args.neighbors),
        },
    }
    if evaluation is not None:
        bundle["evaluation"] = evaluation
    return bundle


def save_json(path, data):
    with path.open("w", encoding="utf-8") as file:
        json.dump(data, file, indent=2, ensure_ascii=False)


def main():
    args = parse_arguments()
    validate_files(args.data_dir)
    args.artifacts_dir.mkdir(parents=True, exist_ok=True)
    args.reports_dir.mkdir(parents=True, exist_ok=True)

    events = load_events(args.data_dir)
    events = iterative_activity_filter(
        events, args.min_user_events, args.min_item_events
    )
    all_items = set(map(int, events["itemid"].unique()))
    category_map = load_latest_item_categories(args.data_dir, all_items)
    train, test = chronological_leave_one_out_split(events)
    evaluation_bundle = build_model_bundle(
        train,
        category_map,
        args,
    )
    ground_truth, evaluation_users = select_evaluation_users(
        test,
        args.evaluation_users,
        args.random_state,
    )
    del ground_truth
    variants = {
        "popularity": {
            "collaborative": 0.0,
            "content": 0.0,
            "popularity": 1.0,
        },
        "content_based": {
            "collaborative": 0.0,
            "content": 1.0,
            "popularity": 0.0,
        },
        "item_collaborative": {
            "collaborative": 1.0,
            "content": 0.0,
            "popularity": 0.0,
        },
        "hybrid": evaluation_bundle["weights"],
    }
    comparison = {}
    for name, weights in variants.items():
        print(f"Evaluating {name} recommender...")
        comparison[name] = evaluate_model(
            test,
            evaluation_bundle,
            args.top_k,
            evaluation_users,
            weights,
        )

    evaluation_report = {
        "dataset": "Retailrocket e-commerce behavior dataset",
        "split_method": "chronological leave-one-out per user",
        "relevance": "last eligible interaction for each user",
        "k": int(args.top_k),
        "evaluated_users": int(len(evaluation_users)),
        "event_weights": EVENT_WEIGHTS,
        "variants": comparison,
        "notes": [
            "Offline dataset metrics do not represent live Selbuy marketplace performance.",
            "The public dataset has view, add-to-cart, and transaction events; it has no Selbuy saves or auction bids.",
            "Retailrocket item IDs must not be mapped to Selbuy products without a verified crosswalk.",
        ],
    }
    evaluation_interactions = int(len(test))
    evaluated_users = int(len(evaluation_users))
    del evaluation_bundle, train, test, evaluation_users
    gc.collect()

    print("Training final model on all filtered interactions...")
    final_bundle = build_model_bundle(
        events,
        category_map,
        args,
        comparison["hybrid"],
    )
    final_bundle["evaluation_comparison"] = evaluation_report
    del events
    gc.collect()

    model_path = args.artifacts_dir / "selbuy_m3_bundle.joblib"
    metrics_path = args.reports_dir / "evaluation_metrics.json"
    metadata_path = args.reports_dir / "training_metadata.json"
    final_bundle["metadata"]["evaluation_interactions"] = evaluation_interactions
    final_bundle["metadata"]["evaluated_users"] = evaluated_users
    final_bundle["metadata"]["split_method"] = (
        "chronological leave-one-out per user"
    )
    temporary_model_path = model_path.with_suffix(".joblib.tmp")
    joblib.dump(final_bundle, temporary_model_path, compress=3)
    os.replace(temporary_model_path, model_path)
    save_json(metrics_path, evaluation_report)
    save_json(metadata_path, final_bundle["metadata"])

    print("\nTraining completed successfully.")
    print(f"Model saved: {model_path}")
    print(f"Metrics saved: {metrics_path}")
    print(f"Metadata saved: {metadata_path}")
    print(json.dumps(evaluation_report, indent=2))


if __name__ == "__main__":
    main()
