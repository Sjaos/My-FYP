export function mergeRecommendations(
  aiRecommendations,
  fallbackRecommendations,
  limit
) {
  const results = [...aiRecommendations];
  const usedIds = new Set(
    results.map((item) => item.product.id)
  );

  for (const item of fallbackRecommendations) {
    if (results.length >= limit) {
      break;
    }

    if (!item?.product?.id || usedIds.has(item.product.id)) {
      continue;
    }

    results.push({
      ...item,
      source: "javascript-fallback",
    });
    usedIds.add(item.product.id);
  }

  return results;
}

export function recommendationSource(recommendations) {
  const hasTrainedModelRecommendations = recommendations.some(
    (item) => item.source === "fastapi-trained-model"
  );
  const hasFallbackRecommendations = recommendations.some(
    (item) => item.source === "javascript-fallback"
  );

  if (!hasTrainedModelRecommendations) {
    return "javascript-fallback";
  }

  if (hasFallbackRecommendations) {
    return "trained-model-and-fallback";
  }

  return "fastapi-trained-model";
}
