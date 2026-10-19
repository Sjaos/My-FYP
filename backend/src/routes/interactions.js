import { Router } from "express";

import {
  supabase,
} from "../config/supabase.js";

import {
  auth,
  role,
} from "../middleware/auth.js";

const router = Router();

const interactionWeights = {
  view: 1,
  save: 4,
};

router.post(
  "/",
  auth,
  role("buyer"),
  async (request, response) => {
    try {
      const productId = String(
        request.body.productId || ""
      ).trim();

      const interactionType = String(
        request.body.type || ""
      ).trim();

      if (!productId) {
        return response
          .status(400)
          .json({
            message:
              "Product ID is required",
          });
      }

      if (
        !interactionWeights[
          interactionType
        ]
      ) {
        return response
          .status(400)
          .json({
            message:
              "Interaction type must be view or save",
          });
      }

      const {
        data: product,
        error: productError,
      } = await supabase
        .from("products")
        .select("id, status")
        .eq("id", productId)
        .eq("status", "active")
        .maybeSingle();

      if (productError) {
        console.error(
          "Interaction product check error:",
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

      const {
        data: interaction,
        error: insertError,
      } = await supabase
        .from("interactions")
        .insert({
          user_id: request.user.id,
          product_id: productId,
          interaction_type:
            interactionType,
          weight:
            interactionWeights[
              interactionType
            ],
        })
        .select("*")
        .single();

      if (insertError) {
        console.error(
          "Create interaction error:",
          insertError
        );

        if (
          insertError.code === "23503"
        ) {
          return response
            .status(400)
            .json({
              message:
                "User or product does not exist",
            });
        }

        return response
          .status(500)
          .json({
            message:
              "Interaction could not be recorded",
          });
      }

      return response
        .status(201)
        .json({
          id: interaction.id,
          userId:
            interaction.user_id,
          productId:
            interaction.product_id,
          type:
            interaction.interaction_type,
          weight:
            interaction.weight,
          createdAt:
            interaction.created_at,
        });
    } catch (error) {
      console.error(
        "Interaction route error:",
        error
      );

      return response
        .status(500)
        .json({
          message:
            "Interaction could not be recorded",
        });
    }
  }
);

export default router;