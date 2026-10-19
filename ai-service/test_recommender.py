import json

from src.recommender import (
    SelbuyHybridRecommender,
)


MODEL_PATH = (
    "artifacts/selbuy_m3_bundle.joblib"
)


def main():
    recommender = SelbuyHybridRecommender(
        MODEL_PATH
    )

    health = recommender.health()
    print("MODEL HEALTH")
    print(json.dumps(health, indent=2))

    if health["status"] != "ok":
        raise RuntimeError("Recommendation model health check failed.")

    available_users = recommender.bundle[
        "user_ids"
    ]

    available_items = recommender.bundle[
        "item_ids"
    ]

    if not available_users:
        raise RuntimeError(
            "No trained users were found."
        )

    if not available_items:
        raise RuntimeError(
            "No trained items were found."
        )

    sample_user = available_users[0]
    sample_item = available_items[0]

    user_recommendations = recommender.recommend(
        user_id=sample_user,
        top_k=5,
    )
    seen_items = {
        item_id
        for item_id, _ in recommender.bundle["user_histories"].get(
            sample_user,
            [],
        )
    }

    if not user_recommendations:
        raise RuntimeError("Known-user recommendations are empty.")

    recommended_ids = [
        item["item_id"]
        for item in user_recommendations
    ]
    if len(recommended_ids) != len(set(recommended_ids)):
        raise RuntimeError("Recommendations contain duplicate items.")

    if seen_items.intersection(recommended_ids):
        raise RuntimeError("Recommendations include items already seen by the user.")

    print(
        f"\nRECOMMENDATIONS FOR USER "
        f"{sample_user}"
    )

    print(
        json.dumps(
            user_recommendations,
            indent=2,
        )
    )

    similar_recommendations = recommender.similar_items(
        item_id=sample_item,
        top_k=5,
    )
    similar_ids = [
        item["item_id"]
        for item in similar_recommendations
    ]
    if sample_item in similar_ids:
        raise RuntimeError("Similar-item results include the source item.")
    if len(similar_ids) != len(set(similar_ids)):
        raise RuntimeError("Similar-item results contain duplicates.")

    print(
        f"\nSIMILAR ITEMS FOR ITEM "
        f"{sample_item}"
    )

    print(
        json.dumps(
            similar_recommendations,
            indent=2,
        )
    )

    cold_start_recommendations = recommender.recommend(
        user_id=-999999,
        top_k=5,
    )
    if not cold_start_recommendations:
        raise RuntimeError("Cold-start recommendations are empty.")
    if any(
        item["reason"] != "Popular product for a new user"
        for item in cold_start_recommendations
    ):
        raise RuntimeError("Cold-start recommendations did not use popularity fallback.")

    print(
        "\nCOLD-START RECOMMENDATIONS"
    )

    print(
        json.dumps(
            cold_start_recommendations,
            indent=2,
        )
    )

    history_recommendations = recommender.recommend_from_history(
        interacted_items=[
            {
                "item_id": sample_item,
                "weight": 8.0,
            }
        ],
        interests=["Electronics"],
        top_k=5,
    )
    if not history_recommendations:
        raise RuntimeError("History-based recommendations are empty.")
    if sample_item in {
        item["item_id"]
        for item in history_recommendations
    }:
        raise RuntimeError("History recommendations include the interacted item.")

    print(
        f"\nHISTORY-BASED RECOMMENDATIONS FOR ITEM "
        f"{sample_item}"
    )
    print(json.dumps(history_recommendations, indent=2))

    try:
        recommender.recommend_from_history(
            interacted_items=[],
            top_k=0,
        )
    except ValueError:
        pass
    else:
        raise RuntimeError("Invalid top_k was not rejected.")

    print("\nAll recommender inference checks passed.")


if __name__ == "__main__":
    main()
