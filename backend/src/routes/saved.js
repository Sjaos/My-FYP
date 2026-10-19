import { Router } from "express";

import {
  supabase,
} from "../config/supabase.js";

import {
  auth,
  role,
} from "../middleware/auth.js";

import {
  mapProduct,
  publicProduct,
} from "../utils.js";

const router = Router();

router.use(
  auth,
  role("buyer")
);

/*
  Buyer ke tamam saved products
*/
router.get(
  "/",
  async (request, response) => {
    try {
      const {
        data,
        error,
      } = await supabase
        .from("saved_items")
        .select(`
          id,
          created_at,
          product:products (
            *
          )
        `)
        .eq(
          "user_id",
          request.user.id
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        );

      if (error) {
        console.error(
          "Fetch saved products error:",
          error
        );

        return response
          .status(500)
          .json({
            message:
              "Saved products could not be loaded",
          });
      }

      const items = (data || [])
        .filter(
          (savedItem) =>
            savedItem.product &&
            savedItem.product.status ===
              "active"
        )
        .map(
          (savedItem) =>
            publicProduct(
              mapProduct(
                savedItem.product
              )
            )
        );

      return response.json({
        items,
      });
    } catch (error) {
      console.error(
        "Saved products route error:",
        error
      );

      return response
        .status(500)
        .json({
          message:
            "Saved products could not be loaded",
        });
    }
  }
);

/*
  Check specific product saved hai ya nahi
*/
router.get(
  "/status/:productId",
  async (request, response) => {
    try {
      const {
        data,
        error,
      } = await supabase
        .from("saved_items")
        .select("id")
        .eq(
          "user_id",
          request.user.id
        )
        .eq(
          "product_id",
          request.params.productId
        )
        .maybeSingle();

      if (error) {
        console.error(
          "Saved status error:",
          error
        );

        return response
          .status(500)
          .json({
            message:
              "Saved status could not be checked",
          });
      }

      return response.json({
        saved: Boolean(data),
      });
    } catch (error) {
      console.error(
        "Saved status route error:",
        error
      );

      return response
        .status(500)
        .json({
          message:
            "Saved status could not be checked",
        });
    }
  }
);

/*
  Product save karna
*/
router.post(
  "/",
  async (request, response) => {
    try {
      const productId = String(
        request.body.productId || ""
      ).trim();

      if (!productId) {
        return response
          .status(400)
          .json({
            message:
              "Product ID is required",
          });
      }

      const {
        data: product,
        error: productError,
      } = await supabase
        .from("products")
        .select(
          "id, seller_id, status"
        )
        .eq(
          "id",
          productId
        )
        .eq(
          "status",
          "active"
        )
        .maybeSingle();

      if (productError) {
        console.error(
          "Save product check error:",
          productError
        );

        return response
          .status(500)
          .json({
            message:
              "Product could not be checked",
          });
      }

      if (!product) {
        return response
          .status(404)
          .json({
            message:
              "Product not found",
          });
      }

      if (
        product.seller_id ===
        request.user.id
      ) {
        return response
          .status(400)
          .json({
            message:
              "You cannot save your own product",
          });
      }

      const {
        data: existingSavedItem,
        error: existingError,
      } = await supabase
        .from("saved_items")
        .select("id")
        .eq(
          "user_id",
          request.user.id
        )
        .eq(
          "product_id",
          productId
        )
        .maybeSingle();

      if (existingError) {
        console.error(
          "Check saved item error:",
          existingError
        );

        return response
          .status(500)
          .json({
            message:
              "Saved item could not be checked",
          });
      }

      if (existingSavedItem) {
        return response.json({
          saved: true,
          message:
            "Product is already saved",
        });
      }

      const {
        data: savedItem,
        error: saveError,
      } = await supabase
        .from("saved_items")
        .insert({
          user_id: request.user.id,
          product_id: productId,
        })
        .select("*")
        .single();

      if (saveError) {
        console.error(
          "Save product error:",
          saveError
        );

        if (
          saveError.code === "23505"
        ) {
          return response.json({
            saved: true,
            message:
              "Product is already saved",
          });
        }

        if (
          saveError.code === "23503"
        ) {
          return response
            .status(400)
            .json({
              message:
                "Buyer or product does not exist",
            });
        }

        return response
          .status(500)
          .json({
            message:
              "Product could not be saved",
          });
      }

      /*
        Save interaction recommendation
        system ke liye record hogi.
      */
      const {
        error: interactionError,
      } = await supabase
        .from("interactions")
        .insert({
          user_id: request.user.id,
          product_id: productId,
          interaction_type: "save",
          weight: 4,
        });

      if (interactionError) {
        console.error(
          "Save interaction error:",
          interactionError
        );
      }

      return response
        .status(201)
        .json({
          saved: true,
          savedItemId:
            savedItem.id,
          message:
            "Product saved successfully",
        });
    } catch (error) {
      console.error(
        "Save product route error:",
        error
      );

      return response
        .status(500)
        .json({
          message:
            "Product could not be saved",
        });
    }
  }
);

/*
  Product unsave karna
*/
router.delete(
  "/:productId",
  async (request, response) => {
    try {
      const productId = String(
        request.params.productId || ""
      ).trim();

      if (!productId) {
        return response
          .status(400)
          .json({
            saved: false,
            message:
              "Product ID is required",
          });
      }

      const {
        data: existingSavedItem,
        error: existingError,
      } = await supabase
        .from("saved_items")
        .select("id")
        .eq(
          "user_id",
          request.user.id
        )
        .eq(
          "product_id",
          productId
        )
        .maybeSingle();

      if (existingError) {
        console.error(
          "Check saved item error:",
          existingError
        );

        return response
          .status(500)
          .json({
            saved: false,
            message:
              "Saved product could not be checked",
          });
      }

      if (!existingSavedItem) {
        return response
          .status(404)
          .json({
            saved: false,
            message:
              "Product is not in saved items",
          });
      }

      const {
        error: deleteError,
      } = await supabase
        .from("saved_items")
        .delete()
        .eq(
          "id",
          existingSavedItem.id
        )
        .eq(
          "user_id",
          request.user.id
        );

      if (deleteError) {
        console.error(
          "Remove saved item error:",
          deleteError
        );

        return response
          .status(500)
          .json({
            saved: true,
            message:
              "Product could not be removed from saved items",
          });
      }

      /*
        Sirf save interactions delete hongi.
        View interactions retain rahengi.
      */
      const {
        error: interactionError,
      } = await supabase
        .from("interactions")
        .delete()
        .eq(
          "user_id",
          request.user.id
        )
        .eq(
          "product_id",
          productId
        )
        .eq(
          "interaction_type",
          "save"
        );

      if (interactionError) {
        console.error(
          "Remove save interaction error:",
          interactionError
        );
      }

      return response.json({
        saved: false,
        message:
          "Product removed from saved items",
      });
    } catch (error) {
      console.error(
        "Unsave product route error:",
        error
      );

      return response
        .status(500)
        .json({
          saved: false,
          message:
            "Product could not be removed from saved items",
        });
    }
  }
);

export default router;