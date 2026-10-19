import assert from "node:assert/strict";
import test from "node:test";
import {
  personalized,
  similarProducts,
} from "../src/recommender.js";

const products = [
  {
    id: "viewed-electronics",
    title: "Wireless study laptop",
    description: "Portable computer",
    category: "Electronics",
    condition: "Used",
    price: 50000,
    status: "active",
    createdAt: "2026-01-01",
  },
  {
    id: "recommended-electronics",
    title: "Wireless camera",
    description: "Portable digital camera",
    category: "Electronics",
    condition: "New",
    price: 55000,
    status: "active",
    createdAt: "2026-01-02",
  },
  {
    id: "furniture",
    title: "Wooden study desk",
    description: "Large writing desk",
    category: "Furniture",
    condition: "New",
    price: 15000,
    status: "active",
    createdAt: "2026-01-03",
  },
  {
    id: "inactive-electronics",
    title: "Wireless headphones",
    description: "Portable audio device",
    category: "Electronics",
    condition: "New",
    price: 10000,
    status: "inactive",
    createdAt: "2026-01-04",
  },
];

test("personalized results use interests and exclude previously interacted products", () => {
  const results = personalized(
    {
      id: "buyer-1",
      interests: ["Electronics"],
    },
    {
      products,
      historyProducts: products,
      interactions: [
        {
          userId: "buyer-1",
          productId: "viewed-electronics",
          type: "view",
          weight: 1,
        },
      ],
      savedItems: [],
    },
    10
  );

  const ids = results.map((result) => result.product.id);
  assert.ok(ids.includes("recommended-electronics"));
  assert.ok(!ids.includes("viewed-electronics"));
  assert.ok(!ids.includes("inactive-electronics"));
});

test("purchase history contributes to recommendation explanations", () => {
  const results = personalized(
    {
      id: "buyer-2",
      interests: [],
    },
    {
      products,
      historyProducts: products,
      interactions: [
        {
          userId: "buyer-2",
          productId: "viewed-electronics",
          type: "purchase",
          weight: 8,
        },
      ],
      savedItems: [],
    },
    10
  );

  const relatedProduct = results.find(
    (result) =>
      result.product.id === "recommended-electronics"
  );

  assert.ok(relatedProduct);
  assert.equal(
    relatedProduct.reason,
    "Similar to a product you purchased"
  );
});

test("cold-start recommendations use selected interests", () => {
  const results = personalized(
    {
      id: "new-buyer",
      interests: ["Furniture"],
    },
    {
      products,
      interactions: [],
      savedItems: [],
    },
    10
  );

  assert.equal(
    results[0].product.id,
    "furniture"
  );
  assert.equal(
    results[0].reason,
    "Based on your Furniture interest"
  );
});

test("similar products exclude the source and inactive listings", () => {
  const results = similarProducts(
    products[0],
    products,
    10
  );
  const ids = results.map((result) => result.product.id);

  assert.ok(!ids.includes("viewed-electronics"));
  assert.ok(!ids.includes("inactive-electronics"));
});
