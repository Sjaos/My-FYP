import { Router } from "express";

import { supabase } from "../config/supabase.js";
import { auth, role } from "../middleware/auth.js";
import {
  limitOf,
  mapProduct,
  mapUser,
} from "../utils.js";

import {
  personalized,
  similarProducts,
} from "../recommender.js";
import {
  mergeRecommendations,
  recommendationSource,
} from "../recommendationResponses.js";

import {
  checkAiHealth,
  getSimilarAiItems,
  recommendFromHistory,
} from "../services/aiClient.js";

const router = Router();

/*
  Product ka valid AI item ID return karta hai.
*/
function getAiItemId(product) {
  if (
    product?.aiItemId === null ||
    product?.aiItemId === undefined ||
    product?.aiItemId === ""
  ) {
    return null;
  }

  const value = Number(product.aiItemId);

  return Number.isSafeInteger(value)
    ? value
    : null;
}

/*
  Recommendation ko frontend format mein
  convert karta hai.
*/
function formatRecommendation(
  product,
  recommendation,
  source = "fastapi-trained-model"
) {
  return {
    product,

    reason:
      recommendation?.reason ||
      "Recommended product",

    score: Number(
      recommendation?.score || 0
    ),

    source,

    aiItemId: getAiItemId(product),
  };
}

/*
  Supabase interaction ko existing recommender
  ke camelCase format mein convert karta hai.
*/
function mapInteraction(row) {
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id,
    type: row.interaction_type,
    weight: Number(row.weight || 0),
    createdAt: row.created_at,
  };
}

/*
  Supabase saved item ko existing recommender
  ke camelCase format mein convert karta hai.
*/
function mapSavedItem(row) {
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id,
    createdAt: row.created_at,
  };
}

/*
  Supabase se active products load karta hai.
*/
async function loadActiveProducts() {
  const {
    data,
    error,
  } = await supabase
    .from("products")
    .select("*")
    .eq("status", "active")
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error(
      "Active products query error:",
      error
    );

    throw new Error(
      "Active products could not be loaded"
    );
  }

  return (data || []).map(mapProduct);
}

/*
  Buyer ka complete recommendation data
  Supabase se load karta hai.
*/
async function loadBuyerData(userId) {
  const [
    userResult,
    productsResult,
    interactionsResult,
    savedItemsResult,
  ] = await Promise.all([
    supabase
      .from("users")
      .select(`
        id,
        name,
        email,
        role,
        interests,
        shipping_info,
        email_verified,
        is_active,
        created_at,
        updated_at
      `)
      .eq("id", userId)
      .maybeSingle(),

    supabase
      .from("products")
      .select("*")
      .order("created_at", {
        ascending: false,
      }),

    supabase
      .from("interactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", {
        ascending: false,
      }),

    supabase
      .from("saved_items")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", {
        ascending: false,
      }),
  ]);

  if (userResult.error) {
    console.error(
      "Recommendation user error:",
      userResult.error
    );

    throw new Error(
      "Buyer account could not be loaded"
    );
  }

  if (productsResult.error) {
    console.error(
      "Recommendation products error:",
      productsResult.error
    );

    throw new Error(
      "Products could not be loaded"
    );
  }

  if (interactionsResult.error) {
    console.error(
      "Recommendation interactions error:",
      interactionsResult.error
    );

    throw new Error(
      "Buyer activity could not be loaded"
    );
  }

  if (savedItemsResult.error) {
    console.error(
      "Recommendation saved-items error:",
      savedItemsResult.error
    );

    throw new Error(
      "Saved items could not be loaded"
    );
  }

  return {
    user: mapUser(userResult.data),

    database: {
      products: (
        productsResult.data || []
      )
        .filter((product) => product.status === "active")
        .map(mapProduct),

      historyProducts: (
        productsResult.data || []
      ).map(mapProduct),

      interactions: (
        interactionsResult.data || []
      ).map(mapInteraction),

      savedItems: (
        savedItemsResult.data || []
      ).map(mapSavedItem),
    },
  };
}

/*
  AI service health route
*/
router.get(
  "/health/ai",
  async (request, response) => {
    try {
      const [
        health,
        mappingResult,
      ] = await Promise.all([
        checkAiHealth(),
        supabase
          .from("products")
          .select("id, ai_item_id, status"),
      ]);

      if (mappingResult.error) {
        console.error(
          "Recommendation catalog mapping health error:",
          mappingResult.error
        );

        return response.status(503).json({
          connected: true,
          source: "fastapi-trained-model",
          message:
            "AI is online, but catalog mapping could not be checked. Apply Schema/recommendation_catalog_migration.sql.",
        });
      }

      const products = mappingResult.data || [];
      const mappedProducts = products.filter(
        (product) => product.ai_item_id !== null
      );
      const mappedActiveProducts = mappedProducts.filter(
        (product) => product.status === "active"
      );

      return response.json({
        connected: true,
        source:
          "fastapi-trained-model",
        aiService: health,
        catalogMapping: {
          totalProducts: products.length,
          mappedProducts: mappedProducts.length,
          mappedActiveProducts: mappedActiveProducts.length,
        },
      });
    } catch (error) {
      return response
        .status(503)
        .json({
          connected: false,

          message:
            error.message ||
            "AI service is unavailable",
        });
    }
  }
);

/*
  Public similar products route
*/
router.get(
  "/similar/:productId",
  async (request, response) => {
    try {
      const productId =
        request.params.productId;

      const limit = limitOf(
        request.query.limit,
        4,
        20
      );

      const {
        data: productRow,
        error: productError,
      } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .eq("status", "active")
        .maybeSingle();

      if (productError) {
        console.error(
          "Similar product lookup error:",
          productError
        );

        return response
          .status(500)
          .json({
            message:
              "Product could not be loaded",
          });
      }

      if (!productRow) {
        return response
          .status(404)
          .json({
            message:
              "Product not found",
          });
      }

      const product =
        mapProduct(productRow);

      const activeProducts =
        await loadActiveProducts();

      const aiItemId =
        getAiItemId(product);

      /*
        Product AI item ke saath mapped ho to
        FastAPI recommendation try hogi.
      */
      if (aiItemId !== null) {
        try {
          const aiResponse =
            await getSimilarAiItems(
              aiItemId,
              100
            );

          const productsByAiId =
            new Map();

          for (
            const currentProduct
            of activeProducts
          ) {
            const currentAiItemId =
              getAiItemId(
                currentProduct
              );

            if (
              currentProduct.id !==
                product.id &&
              currentAiItemId !== null
            ) {
              productsByAiId.set(
                currentAiItemId,
                currentProduct
              );
            }
          }

          const aiRecommendations = [];

          for (
            const aiResult
            of aiResponse
              .recommendations || []
          ) {
            const matchedProduct =
              productsByAiId.get(
                Number(
                  aiResult.item_id
                )
              );

            if (matchedProduct) {
              aiRecommendations.push(
                formatRecommendation(
                  matchedProduct,
                  aiResult
                )
              );
            }

            if (
              aiRecommendations.length >=
              limit
            ) {
              break;
            }
          }

          const fallbackRecommendations =
            similarProducts(
              product,
              activeProducts,
              limit
            );
          const recommendations =
            mergeRecommendations(
              aiRecommendations,
              fallbackRecommendations,
              limit
            );

          return response.json({
            recommendations,

            aiConnected: true,
            recommendationSource:
              recommendationSource(recommendations),

            mappedAiResults:
              aiRecommendations.length,
          });
        } catch (error) {
          console.error(
            "FastAPI similar products error:",
            error.message
          );
        }
      }

      /*
        AI mapping missing ho ya FastAPI fail ho
        to JavaScript fallback use hoga.
      */
      const fallbackRecommendations =
        similarProducts(
          product,
          activeProducts,
          limit
        ).map((item) => ({
          ...item,
          source:
            "javascript-fallback",
        }));

      return response.json({
        recommendations:
          fallbackRecommendations,

        aiConnected: false,
        recommendationSource:
          "javascript-fallback",

        message:
          aiItemId === null
            ? "Product is not mapped to a trained AI item"
            : "FastAPI unavailable; fallback used",
      });
    } catch (error) {
      console.error(
        "Similar products route error:",
        error
      );

      return response
        .status(500)
        .json({
          message:
            "Similar products could not be loaded",
        });
    }
  }
);

/*
  Buyer personalized recommendations
*/
router.get(
  "/",
  auth,
  role("buyer"),
  async (request, response) => {
    try {
      const {
        user,
        database,
      } = await loadBuyerData(
        request.user.id
      );

      if (!user) {
        return response
          .status(404)
          .json({
            message:
              "Buyer account not found",
          });
      }

      if (user.isActive === false) {
        return response
          .status(403)
          .json({
            message:
              "This buyer account is disabled",
          });
      }

      const limit = limitOf(
        request.query.limit,
        12,
        50
      );

      const {
        data: liveCatalogResults,
        error: liveCatalogError,
      } = await supabase.rpc(
        "recommend_live_catalog",
        {
          p_user_id: request.user.id,
          p_limit: limit,
        }
      );

      if (!liveCatalogError) {
        const productsById = new Map(
          database.products.map(
            (product) => [product.id, product]
          )
        );
        const recommendations = (
          liveCatalogResults || []
        )
          .map((result) => {
            const product = productsById.get(
              result.product_id
            );

            if (!product) {
              return null;
            }

            return {
              product,
              reason: result.reason,
              score: Number(result.score),
              source: "selbuy-live-catalog-hybrid",
              scoreBreakdown: {
                collaborative: Number(
                  result.collaborative_score
                ),
                content: Number(
                  result.content_score
                ),
                popularity: Number(
                  result.popularity_score
                ),
              },
            };
          })
          .filter(Boolean);

        return response.json({
          recommendations,
          recommendationSource:
            "selbuy-live-catalog-hybrid",
          liveCatalogProducts:
            database.products.length,
        });
      }

      console.error(
        "Live Selbuy recommender unavailable; using fallback:",
        liveCatalogError
      );

      const productsById = new Map(
        database.historyProducts.map(
          (product) => [
            product.id,
            product,
          ]
        )
      );

      const productsByAiId =
        new Map();

      for (
        const product
        of database.products
      ) {
        const aiItemId =
          getAiItemId(product);

        if (aiItemId !== null) {
          productsByAiId.set(
            aiItemId,
            product
          );
        }
      }

      /*
        User interactions ko mapped AI item IDs
        ke against aggregate karta hai.
      */
      const historyMap = new Map();

      for (
        const interaction
        of database.interactions
      ) {
        const product =
          productsById.get(
            interaction.productId
          );

        const aiItemId =
          getAiItemId(product);

        if (aiItemId === null) {
          continue;
        }

        const previousWeight =
          historyMap.get(aiItemId) || 0;

        historyMap.set(
          aiItemId,
          previousWeight +
            Number(
              interaction.weight || 0
            )
        );
      }

      for (const savedItem of database.savedItems) {
        const product = productsById.get(
          savedItem.productId
        );
        const aiItemId = getAiItemId(product);

        if (
          aiItemId === null ||
          database.interactions.some(
            (interaction) =>
              interaction.productId === savedItem.productId &&
              interaction.type === "save"
          )
        ) {
          continue;
        }

        historyMap.set(
          aiItemId,
          (historyMap.get(aiItemId) || 0) + 4
        );
      }

      const interactedItems =
        Array.from(
          historyMap.entries()
        ).map(
          ([itemId, weight]) => ({
            itemId,
            weight,
          })
        );

      /*
        FastAPI model pehle try hoga.
      */
      try {
        const aiResponse =
          await recommendFromHistory({
            interactedItems,

            interests:
              user.interests || [],

            topK: 100,
          });

        const aiRecommendations = [];

        for (
          const aiResult
          of aiResponse
            .recommendations || []
        ) {
          const matchedProduct =
            productsByAiId.get(
              Number(
                aiResult.item_id
              )
            );

          if (matchedProduct) {
            aiRecommendations.push(
              formatRecommendation(
                matchedProduct,
                aiResult
              )
            );
          }

          if (
            aiRecommendations.length >=
            limit
          ) {
            break;
          }
        }

        /*
          Existing JavaScript recommender buyer
          interests, views aur saves use karta hai.
        */
        const fallbackRecommendations =
          personalized(
            user,
            database,
            limit
          );
        const recommendations =
          mergeRecommendations(
            aiRecommendations,
            fallbackRecommendations,
            limit
          );

        return response.json({
          recommendations,

          aiConnected: true,
          recommendationSource:
            recommendationSource(recommendations),

          mappedHistoryItems:
            interactedItems.length,

          mappedAiResults:
            aiRecommendations.length,
        });
      } catch (error) {
        console.error(
          "FastAPI personalized error:",
          error.message
        );

        const fallbackRecommendations =
          personalized(
            user,
            database,
            limit
          ).map((item) => ({
            ...item,
            source:
              "javascript-fallback",
          }));

        return response.json({
          recommendations:
            fallbackRecommendations,

          aiConnected: false,
          recommendationSource:
            "javascript-fallback",

          message:
            liveCatalogError.code === "PGRST202"
              ? "Apply Schema/recommendation_catalog_migration.sql to enable personalized recommendations from the live Selbuy catalog."
              : "The live Selbuy recommender and FastAPI are unavailable; JavaScript fallback used.",
        });
      }
    } catch (error) {
      console.error(
        "Personalized recommendations route error:",
        error
      );

      return response
        .status(500)
        .json({
          message:
            error.message ||
            "Recommendations could not be loaded",
        });
    }
  }
);

export default router;