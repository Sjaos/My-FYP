import { normalize } from "./utils.js";

function tokens(product) {
  return new Set(
    normalize(
      `${product.title} ${product.description} ${product.category} ${product.condition}`
    )
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  );
}

function overlap(firstTokens, secondTokens) {
  let matchingTokens = 0;

  for (const token of firstTokens) {
    if (secondTokens.has(token)) {
      matchingTokens++;
    }
  }

  const totalUniqueTokens = new Set([
    ...firstTokens,
    ...secondTokens,
  ]).size;

  return (
    matchingTokens /
    Math.max(totalUniqueTokens, 1)
  );
}

export function similarProducts(
  product,
  products,
  limit
) {
  const productTokens = tokens(product);

  return products
    .filter(
      (currentProduct) =>
        currentProduct.id !== product.id &&
        currentProduct.status === "active"
    )
    .map((currentProduct) => {
      let score = overlap(
        productTokens,
        tokens(currentProduct)
      );

      if (
        normalize(currentProduct.category) ===
        normalize(product.category)
      ) {
        score += 0.45;
      }

      if (
        currentProduct.condition ===
        product.condition
      ) {
        score += 0.05;
      }

      const priceDistance =
        Math.abs(
          Number(currentProduct.price) -
            Number(product.price)
        ) /
        Math.max(Number(product.price), 1);

      score += Math.max(
        0,
        0.15 - priceDistance * 0.15
      );

      return {
        product: currentProduct,
        score,
        reason:
          currentProduct.category ===
          product.category
            ? `Similar ${currentProduct.category} product`
            : "Similar product features",
      };
    })
    .sort(
      (first, second) =>
        second.score - first.score
    )
    .slice(0, limit)
    .map((result) => ({
      product: result.product,
      reason: result.reason,
      score: Number(result.score.toFixed(4)),
    }));
}

export function personalized(user, db, limit) {
  const activeProducts = db.products.filter(
    (product) => product.status === "active"
  );
  const productsById = new Map(
    (db.historyProducts || db.products).map(
      (product) => [product.id, product]
    )
  );

  const userInteractions =
    db.interactions.filter(
      (interaction) =>
        interaction.userId === user.id
    );

  const activity = new Map();

  for (const interaction of userInteractions) {
    activity.set(
      interaction.productId,
      (activity.get(interaction.productId) || 0) +
        Number(interaction.weight || 0)
    );
  }

  const userSavedItems = db.savedItems.filter(
    (savedItem) =>
      savedItem.userId === user.id
  );

  for (const savedItem of userSavedItems) {
    const alreadyHasSaveInteraction =
      userInteractions.some(
        (interaction) =>
          interaction.productId ===
            savedItem.productId &&
          interaction.type === "save"
      );

    if (!alreadyHasSaveInteraction) {
      activity.set(
        savedItem.productId,
        (activity.get(savedItem.productId) || 0) +
          4
      );
    }
  }

  const previouslyInteractedProductIds = new Set(
    activity.keys()
  );
  const activityProfiles = [...activity]
    .map(([productId, weight]) => ({
      product: productsById.get(productId),
      weight,
    }))
    .filter(
      (profile) => profile.product
    );

  return activeProducts
    .filter(
      (product) =>
        !previouslyInteractedProductIds.has(
          product.id
        )
    )
    .map((product) => {
      let score = 0;
      let reason = "Recently added";

      for (const interest of user.interests || []) {
        if (
          normalize(product.category) ===
          normalize(interest)
        ) {
          score += 3;
          reason =
            `Based on your ${interest} interest`;
        }
      }

      for (const profile of activityProfiles) {
        if (
          profile.product.id === product.id
        ) {
          score += profile.weight * 0.25;
          reason =
            userInteractions.some(
              (interaction) =>
                interaction.productId === product.id &&
                interaction.type === "purchase"
            )
              ? "Based on a product you purchased"
              : "Based on a product you viewed or saved";
          continue;
        }

        const match = similarProducts(
          profile.product,
          [product],
          1
        )[0];

        if (match) {
          score +=
            match.score * profile.weight;

          if (match.score > 0.3) {
            reason =
              userInteractions.some(
                (interaction) =>
                  interaction.productId === profile.product.id &&
                  interaction.type === "purchase"
              )
                ? "Similar to a product you purchased"
                : "Similar to products you viewed or saved";
          }
        }
      }

      const popularity = db.interactions
        .filter(
          (interaction) =>
            interaction.productId ===
            product.id
        )
        .reduce(
          (total, interaction) =>
            total +
            Number(interaction.weight || 0),
          0
        );

      score += popularity * 0.05;

      return {
        product,
        score,
        reason,
      };
    })
    .sort(
      (first, second) =>
        second.score - first.score ||
        second.product.createdAt.localeCompare(
          first.product.createdAt
        )
    )
    .slice(0, limit)
    .map((result) => ({
      product: result.product,
      reason: result.reason,
      score: Number(result.score.toFixed(4)),
    }));
}