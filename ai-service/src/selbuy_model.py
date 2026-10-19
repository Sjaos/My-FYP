from __future__ import annotations

import math
from collections import defaultdict

import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import normalize

EVENT_WEIGHTS = {"view": 1.0, "save": 4.0, "purchase": 8.0}
PRODUCT_COLUMNS = {
    "product_id",
    "title",
    "description",
    "category",
    "product_type",
    "condition",
    "price",
}
INTERACTION_COLUMNS = {
    "user_id",
    "product_id",
    "interaction_type",
    "created_at",
}


def validate_data(products, interactions):
    missing_products = PRODUCT_COLUMNS - set(products.columns)
    missing_interactions = INTERACTION_COLUMNS - set(interactions.columns)
    if missing_products:
        raise ValueError(
            "Products data is missing columns: "
            + ", ".join(sorted(missing_products))
        )
    if missing_interactions:
        raise ValueError(
            "Interactions data is missing columns: "
            + ", ".join(sorted(missing_interactions))
        )

    products = products.copy()
    interactions = interactions.copy()
    if products["product_id"].isna().any():
        raise ValueError("Product IDs must not be missing.")
    if interactions["product_id"].isna().any():
        raise ValueError("Interaction product IDs must not be missing.")
    if interactions["user_id"].isna().any():
        raise ValueError("Interaction user IDs must not be missing.")
    products["product_id"] = products["product_id"].astype(str).str.strip()
    interactions["product_id"] = (
        interactions["product_id"].astype(str).str.strip()
    )
    interactions["user_id"] = interactions["user_id"].astype(str).str.strip()
    if products["product_id"].eq("").any():
        raise ValueError("Product IDs must not be empty.")
    if products["product_id"].duplicated().any():
        raise ValueError("Product IDs must be unique.")
    if interactions["user_id"].eq("").any():
        raise ValueError("Interaction user IDs must not be empty.")
    unknown_products = set(interactions["product_id"]) - set(
        products["product_id"]
    )
    if unknown_products:
        raise ValueError(
            "Interactions refer to product IDs not present in products data."
        )

    interactions["interaction_type"] = (
        interactions["interaction_type"].astype(str).str.strip().str.lower()
    )
    interactions = interactions[
        interactions["interaction_type"].isin(EVENT_WEIGHTS)
    ].copy()
    if interactions.empty:
        raise ValueError(
            "No supported view, save, or purchase interactions were provided."
        )
    interactions["weight"] = interactions["interaction_type"].map(EVENT_WEIGHTS)
    interactions["created_at"] = pd.to_datetime(
        interactions["created_at"], errors="coerce", utc=True
    )
    if interactions["created_at"].isna().any():
        raise ValueError("Every interaction must have a valid created_at value.")
    return products, interactions.sort_values(
        ["created_at", "user_id", "product_id"]
    ).reset_index(drop=True)


def split_leave_last_product_out(interactions):
    latest_per_product = (
        interactions.sort_values("created_at")
        .drop_duplicates(["user_id", "product_id"], keep="last")
    )
    distinct_product_counts = latest_per_product.groupby("user_id")[
        "product_id"
    ].nunique()
    eligible_users = set(
        distinct_product_counts[distinct_product_counts >= 2].index
    )
    evaluation = (
        latest_per_product[
            latest_per_product["user_id"].isin(eligible_users)
        ]
        .sort_values("created_at")
        .groupby("user_id", sort=True)
        .tail(1)
        .reset_index(drop=True)
    )
    training = interactions[
        ~(
            interactions["user_id"].isin(eligible_users)
            & interactions.set_index(["user_id", "product_id"]).index.isin(
                pd.MultiIndex.from_frame(evaluation[["user_id", "product_id"]])
            )
        )
    ].reset_index(drop=True)
    if evaluation.empty:
        raise ValueError(
            "At least one user must have interactions with two distinct products "
            "for leave-one-product-out evaluation."
        )
    return training, evaluation


def build_model(products, interactions, weights=None, neighbors=30):
    products, interactions = validate_data(products, interactions)
    item_ids = products["product_id"].tolist()
    item_to_index = {item_id: index for index, item_id in enumerate(item_ids)}
    user_ids = sorted(interactions["user_id"].unique())
    user_to_index = {user_id: index for index, user_id in enumerate(user_ids)}

    text_columns = [
        "title",
        "description",
        "category",
        "product_type",
        "condition",
    ]
    product_text = products[text_columns].fillna("").astype(str).agg(" ".join, axis=1)
    if not product_text.str.strip().any():
        raise ValueError(
            "At least one product must have title or descriptive metadata."
        )
    vectorizer = TfidfVectorizer(
        lowercase=True,
        ngram_range=(1, 2),
        token_pattern=r"(?u)\b\w+\b",
    )
    product_vectors = vectorizer.fit_transform(product_text)

    aggregated = interactions.groupby(
        ["user_id", "product_id"], as_index=False
    )["weight"].sum()
    matrix = csr_matrix(
        (
            aggregated["weight"].astype("float32").to_numpy(),
            (
                aggregated["user_id"].map(user_to_index).to_numpy(),
                aggregated["product_id"].map(item_to_index).to_numpy(),
            ),
        ),
        shape=(len(user_ids), len(item_ids)),
        dtype=np.float32,
    )
    item_user = normalize(matrix.T, norm="l2", axis=1, copy=True).tocsr()
    neighbor_count = min(max(neighbors + 1, 2), len(item_ids))
    neighbor_model = NearestNeighbors(
        n_neighbors=neighbor_count,
        metric="cosine",
        algorithm="brute",
        n_jobs=1,
    ).fit(item_user)
    distances, indices = neighbor_model.kneighbors(
        item_user,
        return_distance=True,
    )
    item_neighbors = {}
    for source_index, item_id in enumerate(item_ids):
        candidates = []
        for neighbor_index, distance in zip(
            indices[source_index], distances[source_index]
        ):
            neighbor_id = item_ids[int(neighbor_index)]
            similarity = max(0.0, 1.0 - float(distance))
            if neighbor_id != item_id and similarity > 0:
                candidates.append((neighbor_id, similarity))
        item_neighbors[item_id] = candidates

    popularity = interactions.groupby("product_id")["weight"].sum().to_dict()
    popularity_values = {
        item_id: math.log1p(float(popularity.get(item_id, 0.0)))
        for item_id in item_ids
    }
    maximum_popularity = max(popularity_values.values(), default=0.0)
    if maximum_popularity:
        popularity_values = {
            item_id: value / maximum_popularity
            for item_id, value in popularity_values.items()
        }

    return {
        "version": "selbuy-catalog-hybrid-v1",
        "data_provenance": "Selbuy products and interactions export",
        "weights": weights
        or {"collaborative": 0.55, "content": 0.30, "popularity": 0.15},
        "products": products.to_dict(orient="records"),
        "item_ids": item_ids,
        "item_neighbors": item_neighbors,
        "product_vectors": product_vectors,
        "popularity_scores": popularity_values,
        "training_interactions": int(len(interactions)),
    }


def recommend_from_history(model, history, limit=10):
    if limit < 1:
        raise ValueError("limit must be at least 1.")
    product_index = {
        item_id: index for index, item_id in enumerate(model["item_ids"])
    }
    valid_history = [
        (str(entry["product_id"]), max(float(entry.get("weight", 1.0)), 0.0))
        for entry in history
        if str(entry.get("product_id")) in product_index
    ]
    seen = {item_id for item_id, _ in valid_history}
    collaborative = defaultdict(float)
    content = defaultdict(float)
    for history_item, weight in valid_history:
        strength = math.log1p(weight)
        for candidate_id, similarity in model["item_neighbors"].get(
            history_item, []
        ):
            if candidate_id not in seen:
                collaborative[candidate_id] += similarity * strength
        source_vector = model["product_vectors"][product_index[history_item]]
        similarities = (
            model["product_vectors"] @ source_vector.T
        ).toarray().ravel()
        for index, score in enumerate(similarities):
            candidate_id = model["item_ids"][index]
            if candidate_id not in seen and score > 0:
                content[candidate_id] += float(score) * strength

    collaborative_max = max(collaborative.values(), default=0.0)
    content_max = max(content.values(), default=0.0)
    products_by_id = {
        product["product_id"]: product for product in model["products"]
    }
    results = []
    for candidate_id in model["item_ids"]:
        if candidate_id in seen:
            continue
        collab_score = (
            collaborative.get(candidate_id, 0.0) / collaborative_max
            if collaborative_max
            else 0.0
        )
        content_score = (
            content.get(candidate_id, 0.0) / content_max
            if content_max
            else 0.0
        )
        popularity_score = model["popularity_scores"].get(candidate_id, 0.0)
        weights = model["weights"]
        score = (
            weights["collaborative"] * collab_score
            + weights["content"] * content_score
            + weights["popularity"] * popularity_score
        )
        if collab_score > 0:
            reason = "Similar to products Selbuy buyers interacted with"
        elif content_score > 0:
            reason = "Matches the features of products you interacted with"
        elif not valid_history:
            reason = "Popular with Selbuy buyers"
        else:
            reason = "Recommended from the Selbuy catalog"
        results.append(
            {
                "product_id": candidate_id,
                "product": products_by_id[candidate_id],
                "score": round(float(score), 6),
                "collaborative_score": round(float(collab_score), 6),
                "content_score": round(float(content_score), 6),
                "popularity_score": round(float(popularity_score), 6),
                "reason": reason,
            }
        )
    results.sort(key=lambda row: (-row["score"], row["product_id"]))
    return results[:limit]


def evaluate_model(products, interactions, top_k=5):
    if top_k < 1:
        raise ValueError("top_k must be at least 1.")
    products, interactions = validate_data(products, interactions)
    training, evaluation = split_leave_last_product_out(interactions)
    model = build_model(products, training)
    histories = defaultdict(list)
    for row in training.groupby(
        ["user_id", "product_id"], as_index=False
    )["weight"].sum().itertuples(index=False):
        histories[row.user_id].append((row.product_id, float(row.weight)))
    hits = []
    reciprocal_ranks = []
    for row in evaluation.itertuples(index=False):
        recommendations = recommend_from_history(
            model,
            [
                {"product_id": product_id, "weight": weight}
                for product_id, weight in histories.get(row.user_id, [])
            ],
            top_k,
        )
        ranked = [entry["product_id"] for entry in recommendations]
        if row.product_id in ranked:
            rank = ranked.index(row.product_id) + 1
            hits.append(1.0)
            reciprocal_ranks.append(1.0 / rank)
        else:
            hits.append(0.0)
            reciprocal_ranks.append(0.0)
    evaluated_users = len(evaluation)
    hit_rate = float(np.mean(hits))
    return {
        "evaluated_users": int(evaluated_users),
        "k": int(top_k),
        "hit_rate_at_k": round(hit_rate, 6),
        "mrr_at_k": round(float(np.mean(reciprocal_ranks)), 6),
        "precision_at_k": round(hit_rate / top_k, 6),
        "recall_at_k": round(hit_rate, 6),
    }
