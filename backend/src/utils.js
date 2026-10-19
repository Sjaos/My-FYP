import jwt from "jsonwebtoken";

export function clean(value) {
  return String(value ?? "").trim();
}

export function normalize(value) {
  return clean(value).toLowerCase();
}

export function limitOf(
  value,
  fallback = 12,
  maximum = 50
) {
  const parsedValue = Number.parseInt(
    value,
    10
  );

  const selectedValue =
    Number.isFinite(parsedValue)
      ? parsedValue
      : fallback;

  return Math.min(
    Math.max(selectedValue, 1),
    maximum
  );
}

function getJwtSecret() {
  const jwtSecret =
    process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error(
      "JWT_SECRET is missing in backend/.env"
    );
  }

  return jwtSecret;
}

export function createAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
    },
    getJwtSecret(),
    {
      expiresIn: "1d",
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(
    token,
    getJwtSecret()
  );
}

export function mapUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    interests: Array.isArray(
      row.interests
    )
      ? row.interests
      : [],
    shippingInfo:
      row.shipping_info || null,
    emailVerified: Boolean(
      row.email_verified
    ),
    isActive:
      row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    interests:
      user.interests || [],
    shippingInfo:
      user.shippingInfo || null,
    emailVerified: Boolean(
      user.emailVerified
    ),
  };
}

export function mapProduct(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    sellerId: row.seller_id,
    title: row.title,
    description: row.description,
    category: row.category,
    condition: row.condition,
    sellerType: row.seller_type || null,
    productType: row.product_type || (
      row.condition === "New" ? "new" : "used"
    ),
    stockQuantity: Number(
      row.stock_quantity ?? 1
    ),
    itemCondition:
      row.item_condition || null,
    usageDuration:
      row.usage_duration || "",
    defects: row.defects || "",
    location: row.location || "",
    sellingMethod:
      row.selling_method || "fixed_price",
    price: Number(row.price),
    isSale: Boolean(row.is_sale),
    freeShipping: Boolean(
      row.free_shipping
    ),
    imageUrl: row.image_url || null,
    status: row.status,
    aiItemId:
      row.ai_item_id === null ||
      row.ai_item_id === undefined
        ? null
        : Number(row.ai_item_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function publicProduct(product) {
  if (!product) {
    return null;
  }

  return {
    ...product,
    price: Number(product.price),
  };
}