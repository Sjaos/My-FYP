import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeRecommendations,
  recommendationSource,
} from "../src/recommendationResponses.js";

function recommendation(id, source) {
  return {
    product: { id },
    source,
  };
}

test("source reports fallback when no trained result maps to a listing", () => {
  const recommendations = mergeRecommendations(
    [],
    [recommendation("fallback-1")],
    5
  );

  assert.equal(
    recommendationSource(recommendations),
    "javascript-fallback"
  );
  assert.equal(recommendations[0].source, "javascript-fallback");
});

test("source reports trained model when every result is model-backed", () => {
  const recommendations = mergeRecommendations(
    [recommendation("trained-1", "fastapi-trained-model")],
    [],
    5
  );

  assert.equal(
    recommendationSource(recommendations),
    "fastapi-trained-model"
  );
});

test("source reports mixed results only when fallback listings are included", () => {
  const recommendations = mergeRecommendations(
    [recommendation("trained-1", "fastapi-trained-model")],
    [
      recommendation("trained-1"),
      recommendation("fallback-1"),
    ],
    5
  );

  assert.deepEqual(
    recommendations.map((item) => item.product.id),
    ["trained-1", "fallback-1"]
  );
  assert.equal(
    recommendationSource(recommendations),
    "trained-model-and-fallback"
  );
});

test("merge excludes duplicate products and obeys the requested limit", () => {
  const recommendations = mergeRecommendations(
    [recommendation("trained-1", "fastapi-trained-model")],
    [
      recommendation("trained-1"),
      recommendation("fallback-1"),
      recommendation("fallback-2"),
    ],
    2
  );

  assert.deepEqual(
    recommendations.map((item) => item.product.id),
    ["trained-1", "fallback-1"]
  );
});
