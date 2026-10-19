from pathlib import Path

import joblib

from src.train_m3 import recommend_for_user


class SelbuyHybridRecommender:
    def __init__(self, model_path):
        self.model_path = Path(model_path)

        if not self.model_path.exists():
            raise FileNotFoundError(
                f"Model artifact not found: {self.model_path}"
            )

        self.bundle = joblib.load(self.model_path)

    def health(self):
        return {
            "status": "ok",
            "model_version": self.bundle.get(
                "version",
                "unknown",
            ),
            "users": len(
                self.bundle.get("user_ids", [])
            ),
            "items": len(
                self.bundle.get("item_ids", [])
            ),
            "evaluation": self.bundle.get(
                "evaluation",
                {},
            ),
        }

    def recommend(self, user_id, top_k=10):
        if top_k < 1:
            raise ValueError(
                "top_k must be at least 1."
            )

        top_k = min(top_k, 100)
        weights = self.bundle["weights"]

        return recommend_for_user(
            user_id=int(user_id),
            user_histories=self.bundle[
                "user_histories"
            ],
            item_neighbors=self.bundle[
                "item_neighbors"
            ],
            item_categories=self.bundle[
                "item_categories"
            ],
            category_items=self.bundle[
                "category_items"
            ],
            popularity_scores=self.bundle[
                "popularity_scores"
            ],
            top_k=top_k,
            collaborative_weight=weights[
                "collaborative"
            ],
            content_weight=weights["content"],
            popularity_weight=weights[
                "popularity"
            ],
        )

    def similar_items(self, item_id, top_k=10):
        item_id = int(item_id)
        top_k = min(max(int(top_k), 1), 100)

        item_categories = self.bundle[
            "item_categories"
        ]

        if item_id not in item_categories:
            return []

        item_neighbors = self.bundle[
            "item_neighbors"
        ]

        category_items = self.bundle[
            "category_items"
        ]

        popularity_scores = self.bundle[
            "popularity_scores"
        ]

        collaborative_neighbors = dict(
            item_neighbors.get(item_id, [])
        )

        source_category = item_categories.get(
            item_id,
            "unknown",
        )

        category_candidates = set(
            category_items.get(
                source_category,
                [],
            )
        )

        candidates = (
            set(collaborative_neighbors.keys())
            | category_candidates
        )

        candidates.discard(item_id)

        results = []

        for candidate_id in candidates:
            collaborative_score = float(
                collaborative_neighbors.get(
                    candidate_id,
                    0.0,
                )
            )

            candidate_category = (
                item_categories.get(
                    candidate_id,
                    "unknown",
                )
            )

            same_category = (
                source_category != "unknown"
                and candidate_category
                == source_category
            )

            content_score = (
                1.0 if same_category else 0.0
            )

            popularity_score = float(
                popularity_scores.get(
                    candidate_id,
                    0.0,
                )
            )

            final_score = (
                0.60 * collaborative_score
                + 0.30 * content_score
                + 0.10 * popularity_score
            )

            if collaborative_score > 0:
                reason = (
                    "Collaboratively similar product"
                )
            elif same_category:
                reason = (
                    "Product from the same category"
                )
            else:
                reason = "Popular product"

            results.append(
                {
                    "item_id": int(candidate_id),
                    "score": round(
                        float(final_score),
                        6,
                    ),
                    "collaborative_score": round(
                        collaborative_score,
                        6,
                    ),
                    "content_score": round(
                        content_score,
                        6,
                    ),
                    "popularity_score": round(
                        popularity_score,
                        6,
                    ),
                    "reason": reason,
                }
            )

        results.sort(
            key=lambda item: (
                item["score"],
                item["popularity_score"],
            ),
            reverse=True,
        )

        return results[:top_k]

    def recommend_from_history(
        self,
        interacted_items,
        interests=None,
        top_k=10,
    ):
        if top_k < 1:
            raise ValueError(
                "top_k must be at least 1."
            )

        top_k = min(top_k, 100)
        temporary_user_id = -1

        temporary_histories = dict(
            self.bundle["user_histories"]
        )

        valid_history = []

        for interaction in interacted_items:
            if not isinstance(interaction, dict):
                continue

            if "item_id" not in interaction:
                continue

            try:
                item_id = int(
                    interaction["item_id"]
                )

                weight = float(
                    interaction.get(
                        "weight",
                        1.0,
                    )
                )
            except (TypeError, ValueError):
                continue

            if (
                item_id
                not in self.bundle[
                    "item_categories"
                ]
            ):
                continue

            weight = max(weight, 0.0)

            valid_history.append(
                (item_id, weight)
            )

        temporary_histories[
            temporary_user_id
        ] = valid_history

        weights = self.bundle["weights"]

        return recommend_for_user(
            user_id=temporary_user_id,
            user_histories=temporary_histories,
            item_neighbors=self.bundle[
                "item_neighbors"
            ],
            item_categories=self.bundle[
                "item_categories"
            ],
            category_items=self.bundle[
                "category_items"
            ],
            popularity_scores=self.bundle[
                "popularity_scores"
            ],
            top_k=top_k,
            collaborative_weight=weights[
                "collaborative"
            ],
            content_weight=weights["content"],
            popularity_weight=weights[
                "popularity"
            ],
        )