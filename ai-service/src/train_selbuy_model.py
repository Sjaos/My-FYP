from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import joblib
import pandas as pd

from src.selbuy_model import (
    build_model,
    evaluate_model,
    validate_data,
)

BASE_DIR = Path(__file__).resolve().parent.parent
SYNTHETIC_DATA_DIR = BASE_DIR / "data" / "synthetic_demo"


def synthetic_demo_data():
    catalogue = {
        "Electronics": (
            ["Laptop", "Tablet", "Wireless Headphones", "Digital Camera"],
            ["Portable technology", "wireless device", "computer accessory"],
            [9000, 18000, 25000, 65000],
        ),
        "Furniture": (
            ["Study Desk", "Office Chair", "Bookshelf", "Desk Lamp"],
            ["home office furniture", "wooden study furniture", "room furnishing"],
            [3500, 11000, 14000, 18000],
        ),
        "Books": (
            ["Programming Book", "Novel", "Study Guide", "Design Handbook"],
            ["reading and learning", "educational book", "reference material"],
            [1200, 1800, 2500, 3200],
        ),
        "Clothing": (
            ["Casual Shirt", "Winter Jacket", "Running Shoes", "Travel Bag"],
            ["everyday clothing", "comfortable fashion", "wearable apparel"],
            [2200, 4500, 6000, 8500],
        ),
        "Home & Kitchen": (
            ["Coffee Maker", "Cookware Set", "Storage Organizer", "Blender"],
            ["kitchen equipment", "home cooking", "household appliance"],
            [3000, 5500, 7500, 12000],
        ),
        "Sports": (
            ["Football", "Yoga Mat", "Cricket Bat", "Fitness Dumbbells"],
            ["sports and exercise", "outdoor activity", "fitness equipment"],
            [1800, 2800, 5000, 9000],
        ),
        "Toys": (
            ["Building Blocks", "Board Game", "Remote Car", "Puzzle Set"],
            ["family play", "creative toy", "indoor games"],
            [1500, 2600, 4200, 7000],
        ),
        "Beauty": (
            ["Hair Dryer", "Skin Care Set", "Makeup Organizer", "Electric Trimmer"],
            ["personal care", "beauty products", "daily grooming"],
            [2000, 3500, 4800, 8000],
        ),
        "Automotive": (
            ["Car Phone Mount", "Tyre Inflator", "Dash Camera", "Tool Kit"],
            ["vehicle accessory", "automotive equipment", "car maintenance"],
            [1700, 4000, 8500, 14000],
        ),
        "Stationery": (
            ["Notebook Set", "Drawing Kit", "Desk Organizer", "Pen Collection"],
            ["school and office supplies", "creative stationery", "study tools"],
            [700, 1400, 2400, 3900],
        ),
    }
    product_rows = []
    product_categories = {}
    for category_index, (category, details) in enumerate(catalogue.items()):
        titles, descriptions, prices = details
        for item_index in range(12):
            product_id = f"demo-p{category_index * 12 + item_index + 1:03d}"
            title = titles[item_index % len(titles)]
            variation = item_index // len(titles) + 1
            product_rows.append(
                {
                    "product_id": product_id,
                    "title": f"{title} Model {variation}",
                    "description": (
                        f"{descriptions[item_index % len(descriptions)]}; "
                        "sample listing created for a synthetic recommendation demo"
                    ),
                    "category": category,
                    "product_type": "used" if item_index % 3 == 0 else "new",
                    "condition": "Used" if item_index % 3 == 0 else "New",
                    "price": prices[item_index % len(prices)] + variation * 250,
                }
            )
            product_categories.setdefault(category, []).append(product_id)
    products = pd.DataFrame(product_rows)

    categories = list(catalogue)
    rows = []
    demo_start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    for user_index in range(60):
        primary_category = categories[user_index % len(categories)]
        secondary_category = categories[(user_index * 3 + 1) % len(categories)]
        user_id = f"synthetic-buyer-{user_index + 1:03d}"
        viewed_products = product_categories[primary_category][:]
        if secondary_category != primary_category:
            viewed_products.extend(product_categories[secondary_category][:])
        start_index = (user_index // len(categories)) % 4
        selected_products = [
            viewed_products[(start_index + offset * 2) % len(viewed_products)]
            for offset in range(10)
        ]
        selected_products = list(dict.fromkeys(selected_products))
        while len(selected_products) < 10:
            next_product = viewed_products[len(selected_products)]
            if next_product not in selected_products:
                selected_products.append(next_product)

        for interaction_index, product_id in enumerate(selected_products):
            interaction_type = (
                "purchase"
                if interaction_index in {4, 8}
                else "save"
                if interaction_index in {2, 6}
                else "view"
            )
            event_time = demo_start + timedelta(
                days=user_index * 2,
                hours=interaction_index,
            )
            rows.append(
                {
                    "user_id": user_id,
                    "product_id": product_id,
                    "interaction_type": interaction_type,
                    "created_at": event_time.isoformat(),
                }
            )
    interactions = pd.DataFrame(rows)
    return products, interactions


def train_and_evaluate(products, interactions, provenance, top_k=5):
    products, interactions = validate_data(products, interactions)
    evaluation = evaluate_model(products, interactions, top_k)
    model = build_model(products, interactions)
    model["data_provenance"] = provenance
    report = {
        "model_version": model["version"],
        "data_provenance": provenance,
        "products": len(products),
        "users": int(interactions["user_id"].nunique()),
        "interactions": len(interactions),
        "evaluation": evaluation,
        "limitations": [
            "Synthetic-demo results are pipeline checks only, not evidence of recommendation quality.",
            "Synthetic buyer preferences repeat by design, so high evaluation scores are expected and must not be presented as real-world performance.",
            "The model must be retrained from a fresh Selbuy export before it can recommend real Selbuy listings.",
            "No synthetic product or interaction is added to the production database.",
        ]
        if provenance == "synthetic-demo"
        else [
            "Evaluation uses a chronological leave-last-product-out split.",
            "This model is fitted to the supplied Selbuy export; retrain it as real interactions accumulate.",
        ],
    }
    return model, report


def parse_arguments():
    parser = argparse.ArgumentParser(
        description="Train and evaluate the Selbuy catalog hybrid model."
    )
    parser.add_argument("--products-csv", type=Path)
    parser.add_argument("--interactions-csv", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument(
        "--synthetic-demo",
        action="store_true",
        help="Train only on clearly labelled synthetic demonstration records.",
    )
    return parser.parse_args()


def main():
    args = parse_arguments()
    if args.top_k < 1:
        raise ValueError("--top-k must be at least 1.")
    if args.synthetic_demo:
        if args.products_csv or args.interactions_csv:
            raise ValueError(
                "Do not combine --synthetic-demo with CSV input paths."
            )
        products, interactions = synthetic_demo_data()
        provenance = "synthetic-demo"
        SYNTHETIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
        products_csv = SYNTHETIC_DATA_DIR / "synthetic_demo_products.csv"
        interactions_csv = (
            SYNTHETIC_DATA_DIR / "synthetic_demo_interactions.csv"
        )
        products.to_csv(products_csv, index=False)
        interactions.to_csv(interactions_csv, index=False)
        output = args.output or (
            BASE_DIR / "demo_artifacts" / "selbuy_synthetic_demo_bundle.joblib"
        )
        report_path = args.report or (
            BASE_DIR
            / "reports"
            / "selbuy_synthetic_demo_evaluation.json"
        )
        if "synthetic" not in output.name.lower():
            raise ValueError(
                "Synthetic demo artifacts must have 'synthetic' in the filename."
            )
        if "synthetic" not in report_path.name.lower():
            raise ValueError(
                "Synthetic demo reports must have 'synthetic' in the filename."
            )
    else:
        if not args.products_csv or not args.interactions_csv:
            raise ValueError(
                "Provide --products-csv and --interactions-csv, "
                "or explicitly select --synthetic-demo."
            )
        products = pd.read_csv(args.products_csv, dtype=str)
        interactions = pd.read_csv(args.interactions_csv, dtype=str)
        provenance = "selbuy-export"
        output = args.output or (
            BASE_DIR / "artifacts" / "selbuy_catalog_hybrid_bundle.joblib"
        )
        report_path = args.report or (
            BASE_DIR / "reports" / "selbuy_catalog_evaluation.json"
        )

    model, report = train_and_evaluate(
        products,
        interactions,
        provenance,
        args.top_k,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_output = output.with_suffix(output.suffix + ".tmp")
    joblib.dump(model, temporary_output, compress=3)
    os.replace(temporary_output, output)
    report_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if args.synthetic_demo:
        print(f"Synthetic products CSV: {products_csv}")
        print(f"Synthetic interactions CSV: {interactions_csv}")
    print(f"Model saved: {output}")
    print(f"Evaluation saved: {report_path}")


if __name__ == "__main__":
    main()
