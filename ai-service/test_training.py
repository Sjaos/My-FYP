import tempfile
import unittest
from pathlib import Path

import pandas as pd

from src.train_m3 import (
    evaluate_model,
    load_latest_item_categories,
    recommend_for_user,
)


class RecommendationTrainingTests(unittest.TestCase):
    def setUp(self):
        self.histories = {10: [(1, 1.0)]}
        self.neighbors = {1: [(3, 0.9), (2, 0.2)]}
        self.categories = {1: "electronics", 2: "books", 3: "electronics"}
        self.category_items = {
            "electronics": [1, 3],
            "books": [2],
        }
        self.popularity = {1: 0.2, 2: 1.0, 3: 0.3}

    def test_recommendation_variants_isolate_their_scoring_signals(self):
        popularity_only = recommend_for_user(
            10,
            self.histories,
            self.neighbors,
            self.categories,
            self.category_items,
            self.popularity,
            top_k=2,
            collaborative_weight=0,
            content_weight=0,
            popularity_weight=1,
        )
        self.assertEqual(
            [item["item_id"] for item in popularity_only],
            [2, 3],
        )
        for item in popularity_only:
            self.assertEqual(item["score"], item["popularity_score"])

        content_only = recommend_for_user(
            10,
            self.histories,
            self.neighbors,
            self.categories,
            self.category_items,
            self.popularity,
            top_k=2,
            collaborative_weight=0,
            content_weight=1,
            popularity_weight=0,
        )
        self.assertEqual(
            [item["item_id"] for item in content_only],
            [3, 2],
        )
        for item in content_only:
            self.assertEqual(item["score"], item["content_score"])

    def test_evaluation_uses_same_users_and_expected_ranking_metrics(self):
        test = pd.DataFrame(
            {
                "visitorid": [10],
                "itemid": [3],
                "weight": [1.0],
            }
        )
        bundle = {
            "user_histories": self.histories,
            "item_neighbors": self.neighbors,
            "item_categories": self.categories,
            "category_items": self.category_items,
            "popularity_scores": self.popularity,
            "weights": {
                "collaborative": 1.0,
                "content": 0.0,
                "popularity": 0.0,
            },
        }
        metrics = evaluate_model(
            test,
            bundle,
            top_k=1,
            eligible_users=[10],
        )
        self.assertEqual(metrics["evaluated_users"], 1)
        self.assertEqual(metrics["precision_at_1"], 1.0)
        self.assertEqual(metrics["recall_at_1"], 1.0)
        self.assertEqual(metrics["map_at_1"], 1.0)
        self.assertEqual(metrics["hit_rate_at_1"], 1.0)

    def test_category_loader_uses_latest_allowed_item_category(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            data_dir = Path(temporary_directory)
            columns = ["timestamp", "itemid", "property", "value"]
            pd.DataFrame(
                [
                    [100, 1, "categoryid", "old"],
                    [200, 2, "other", "ignored"],
                ],
                columns=columns,
            ).to_csv(data_dir / "item_properties_part1.csv", index=False)
            pd.DataFrame(
                [
                    [200, 1, "categoryid", "new"],
                    [150, 2, "categoryid", "books"],
                    [300, 4, "categoryid", "not-allowed"],
                ],
                columns=columns,
            ).to_csv(data_dir / "item_properties_part2.csv", index=False)

            categories = load_latest_item_categories(
                data_dir,
                {1, 2, 3},
            )

        self.assertEqual(categories, {1: "new", 2: "books", 3: "unknown"})


if __name__ == "__main__":
    unittest.main()
