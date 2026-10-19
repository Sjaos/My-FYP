import { Router } from "express";
import { supabase } from "../config/supabase.js";
import { auth, role } from "../middleware/auth.js";

const router = Router();
router.use(auth);

const orderFields = `
  id,
  user_id,
  seller_id,
  product_id,
  product_snapshot,
  shipping_info,
  payment_status,
  order_status,
  created_at,
  updated_at,
  product:products (
    title,
    price,
    image_url,
    category,
    condition
  )
`;

function clean(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizePhone(phone) {
  return String(phone ?? "")
    .trim()
    .replace(/[\s()-]/g, "");
}

function validateShipping(body) {
  const shippingInfo = {
    fullName: clean(body.fullName),
    phone: normalizePhone(body.phone),
    address: clean(body.address),
    city: clean(body.city),
  };

  if (shippingInfo.fullName.length < 2 || shippingInfo.fullName.length > 80) {
    return { error: "Full name must be between 2 and 80 characters.", field: "fullName" };
  }

  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+$/.test(shippingInfo.fullName)) {
    return { error: "Full name can contain only letters, spaces, apostrophes, dots and hyphens.", field: "fullName" };
  }

  if (!/^(?:\+92|92|0)3\d{9}$/.test(shippingInfo.phone)) {
    return { error: "Enter a valid Pakistani phone number, for example 03001234567 or +923001234567.", field: "phone" };
  }

  if (shippingInfo.address.length < 10 || shippingInfo.address.length > 200) {
    return { error: "Shipping address must be between 10 and 200 characters.", field: "address" };
  }

  if (shippingInfo.city.length < 2 || shippingInfo.city.length > 60) {
    return { error: "City name must be between 2 and 60 characters.", field: "city" };
  }

  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+$/.test(shippingInfo.city)) {
    return { error: "City can contain only letters, spaces, apostrophes, dots and hyphens.", field: "city" };
  }

  return { shippingInfo };
}

function mapOrder(order) {
  const relatedProduct = Array.isArray(order.product)
    ? order.product[0]
    : order.product;
  const productSnapshot = order.product_snapshot ||
    (relatedProduct
      ? {
          title: relatedProduct.title,
          price: Number(relatedProduct.price),
          imageUrl: relatedProduct.image_url || null,
          category: relatedProduct.category || null,
          condition: relatedProduct.condition || null,
          quantity: 1,
          lineTotal: Number(relatedProduct.price),
        }
      : {});

  return {
    id: order.id,
    buyerId: order.user_id,
    sellerId: order.seller_id,
    productId: order.product_id,
    productSnapshot,
    shippingInfo: order.shipping_info || null,
    paymentStatus: order.payment_status,
    orderStatus: order.order_status,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

function statusErrorStatus(error) {
  if (error.code === "P0001") {
    return 400;
  }

  if (error.code === "22P02") {
    return 400;
  }

  return 500;
}

router.get(
  "/address",
  role("buyer"),
  async (request, response) => {
    try {
      const { data: user, error } = await supabase
        .from("users")
        .select("id, shipping_info")
        .eq("id", request.user.id)
        .maybeSingle();

      if (error) {
        console.error("Fetch shipping address error:", error);
        return response.status(500).json({
          message: "Shipping address could not be loaded.",
        });
      }

      if (!user) {
        return response.status(404).json({
          message: "Buyer account not found.",
        });
      }

      return response.json({
        shippingInfo: user.shipping_info || null,
      });
    } catch (error) {
      console.error("Fetch address route error:", error);
      return response.status(500).json({
        message: "Shipping address could not be loaded.",
      });
    }
  }
);

router.get(
  "/",
  role("buyer"),
  async (request, response) => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(orderFields)
        .eq("user_id", request.user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Fetch buyer orders error:", error);
        return response.status(500).json({
          message: "Your orders could not be loaded.",
        });
      }

      return response.json({
        orders: (data || []).map(mapOrder),
      });
    } catch (error) {
      console.error("Fetch buyer orders route error:", error);
      return response.status(500).json({
        message: "Your orders could not be loaded.",
      });
    }
  }
);

router.get(
  "/seller",
  role("seller"),
  async (request, response) => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(orderFields)
        .eq("seller_id", request.user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Fetch seller orders error:", error);
        return response.status(500).json({
          message: "Seller orders could not be loaded.",
        });
      }

      return response.json({
        orders: (data || []).map(mapOrder),
      });
    } catch (error) {
      console.error("Fetch seller orders route error:", error);
      return response.status(500).json({
        message: "Seller orders could not be loaded.",
      });
    }
  }
);

router.post(
  "/place",
  role("buyer"),
  async (request, response) => {
    try {
      const body = request.body || {};
      const shippingResult = validateShipping(body);
      if (shippingResult.error) {
        return response.status(400).json({
          message: shippingResult.error,
          field: shippingResult.field,
        });
      }

      const rawItems = Array.isArray(body.items)
        ? body.items
        : body.productId
          ? [{ productId: body.productId, quantity: 1 }]
          : [];

      if (!rawItems.length || rawItems.length > 50) {
        return response.status(400).json({
          message: "Your cart must contain between 1 and 50 products.",
        });
      }

      const itemsByProduct = new Map();
      for (const item of rawItems) {
        const productId = clean(item?.productId);
        const quantity = Number(item?.quantity ?? 1);

        if (!productId || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647) {
          return response.status(400).json({
            message: "Each cart item needs a product and a positive whole-number quantity.",
          });
        }

        const combinedQuantity =
          (itemsByProduct.get(productId) || 0) + quantity;
        if (!Number.isSafeInteger(combinedQuantity) || combinedQuantity > 2147483647) {
          return response.status(400).json({
            message: "Combined product quantity exceeds the supported stock limit.",
          });
        }
        itemsByProduct.set(productId, combinedQuantity);
      }

      const items = [...itemsByProduct].map(([productId, quantity]) => ({
        productId,
        quantity,
      }));

      const { data: orders, error: checkoutError } = await supabase.rpc(
        "place_fixed_price_orders",
        {
          p_buyer_id: request.user.id,
          p_items: items,
          p_shipping_info: shippingResult.shippingInfo,
        }
      );

      if (checkoutError) {
        console.error("Atomic checkout failed:", checkoutError);
        const statusCode = statusErrorStatus(checkoutError);
        return response.status(statusCode).json({
          message: statusCode === 500
            ? "Order could not be placed. Confirm the checkout database migration has been applied."
            : checkoutError.message,
        });
      }

      const { error: addressUpdateError } = await supabase
        .from("users")
        .update({ shipping_info: shippingResult.shippingInfo })
        .eq("id", request.user.id);

      if (addressUpdateError) {
        console.error("Shipping address update error:", addressUpdateError);
      }

      return response.status(201).json({
        message: "Order placed successfully!",
        orders: (orders || []).map(mapOrder),
      });
    } catch (error) {
      console.error("Place order route error:", error);
      return response.status(500).json({
        message: "Order could not be placed. Please try again.",
      });
    }
  }
);

router.patch(
  "/:orderId/status",
  async (request, response) => {
    try {
      const newStatus = clean(request.body?.status);
      const userRole = request.user.role;
      const isBuyerCancellation =
        userRole === "buyer" && newStatus === "Cancelled";
      const isSellerUpdate = [
        "business_seller",
        "individual_seller",
      ].includes(userRole);

      if (!isBuyerCancellation && !isSellerUpdate) {
        return response.status(403).json({
          message: "Only the buyer can cancel an order; sellers manage order progress.",
        });
      }

      const { data, error } = await supabase.rpc(
        "transition_order_status",
        {
          p_order_id: request.params.orderId,
          p_actor_id: request.user.id,
          p_new_status: newStatus,
        }
      );

      if (error) {
        console.error("Order status update failed:", error);
        return response.status(statusErrorStatus(error)).json({
          message: error.code === "PGRST202"
            ? "Apply the checkout database migration before updating orders."
            : error.message || "Order status could not be updated.",
        });
      }

      const order = Array.isArray(data) ? data[0] : data;
      return response.json({
        message: `Order status updated to ${order.order_status}.`,
        order: mapOrder(order),
      });
    } catch (error) {
      console.error("Order status route error:", error);
      return response.status(500).json({
        message: "Order status could not be updated.",
      });
    }
  }
);

export default router;
