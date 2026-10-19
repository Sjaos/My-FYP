import unittest
import tempfile
from pathlib import Path

import joblib
import subprocess
import sys

from src.selbuy_model import (
    evaluate_model,
    recommend_from_history,
    split_leave_last_product_out,
    validate_data,
)
from src.train_selbuy_model import synthetic_demo_data, train_and_evaluate


class SelbuyHybridTrainingTests(unittest.TestCase):
    def setUp(self):
        self.products, self.interactions = synthetic_demo_data()

    def test_synthetic_demo_trains_and_is_clearly_labelled(self):
        model, report = train_and_evaluate(
            self.products,
            self.interactions,
            "synthetic-demo",
        )

        self.assertEqual(model["version"], "selbuy-catalog-hybrid-v1")
        self.assertEqual(model["data_provenance"], "synthetic-demo")
        self.assertEqual(report["data_provenance"], "synthetic-demo")
        self.assertEqual(report["products"], 120)
        self.assertEqual(report["users"], 60)
        self.assertEqual(report["interactions"], 600)
        self.assertEqual(report["evaluation"]["evaluated_users"], 60)
        self.assertTrue(
            all(
                "synthetic" in limitation.lower()
                or "production" in limitation.lower()
                or "real selbuy" in limitation.lower()
                for limitation in report["limitations"]
            )
        )

    def test_recommendations_exclude_history_and_rank_results(self):
        model, _ = train_and_evaluate(
            self.products,
            self.interactions,
            "synthetic-demo",
        )
        recommendations = recommend_from_history(
            model,
            [{"product_id": "demo-p01", "weight": 4}],
            limit=5,
        )

        recommended_ids = [
            recommendation["product_id"]
            for recommendation in recommendations
        ]
        self.assertNotIn("demo-p01", recommended_ids)
        self.assertEqual(len(recommended_ids), len(set(recommended_ids)))
        self.assertEqual(
            [item["score"] for item in recommendations],
            sorted(
                [item["score"] for item in recommendations],
                reverse=True,
            ),
        )

    def test_csv_validation_rejects_unmatched_product_ids(self):
        products = self.products.copy()
        interactions = self.interactions.copy()
        interactions.loc[0, "product_id"] = "not-in-catalog"

        with self.assertRaisesRegex(ValueError, "not present"):
            validate_data(products, interactions)

    def test_evaluation_split_withholds_latest_distinct_product_per_user(self):
        training, held_out = split_leave_last_product_out(self.interactions)

        self.assertEqual(len(held_out), 60)
        for row in held_out.itertuples(index=False):
            user_training = training[
                training["user_id"] == row.user_id
            ]
            self.assertNotIn(row.product_id, set(user_training["product_id"]))
        metrics = evaluate_model(self.products, self.interactions)
        self.assertEqual(metrics["evaluated_users"], 60)

    def test_demo_cli_writes_only_explicitly_synthetic_artifacts(self):
        base_directory = Path(__file__).resolve().parent
        with tempfile.TemporaryDirectory() as temporary_directory:
            output = Path(temporary_directory) / "selbuy_synthetic_test.joblib"
            report = Path(temporary_directory) / "selbuy_synthetic_test.json"
            subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "src.train_selbuy_model",
                    "--synthetic-demo",
                    "--output",
                    str(output),
                    "--report",
                    str(report),
                ],
                cwd=base_directory,
                check=True,
                capture_output=True,
                text=True,
            )

            model = joblib.load(output)
            self.assertEqual(model["data_provenance"], "synthetic-demo")
            self.assertTrue(report.exists())
            synthetic_data = base_directory / "data" / "synthetic_demo"
            self.assertTrue(
                (synthetic_data / "synthetic_demo_products.csv").exists()
            )
            self.assertTrue(
                (synthetic_data / "synthetic_demo_interactions.csv").exists()
            )


if __name__ == "__main__":
    unittest.main()
