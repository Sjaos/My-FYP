const CART_KEY = "selbuy.cart";

export function getCart() {
  try {
    const cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(cart)
      ? cart.filter((item) => item?.productId && Number.isSafeInteger(item.quantity))
      : [];
  } catch {
    return [];
  }
}

export function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event("selbuy:cart-change"));
  return cart;
}

export function addToCart(product) {
  const cart = getCart();
  const existing = cart.find((item) => item.productId === product.id);
  const maxQuantity = product.sellerType === "individual_seller"
    ? 1
    : Number(product.stockQuantity);

  if (existing) {
    existing.quantity = Math.min(existing.quantity + 1, maxQuantity);
  } else {
    cart.push({
      productId: product.id,
      quantity: 1,
      title: product.title,
      price: Number(product.price),
      imageUrl: product.imageUrl || null,
      sellerType: product.sellerType,
      stockQuantity: maxQuantity,
    });
  }

  return saveCart(cart);
}

export function updateCartQuantity(productId, quantity) {
  const cart = getCart().map((item) => {
    if (item.productId !== productId) {
      return item;
    }

    const maxQuantity = item.sellerType === "individual_seller"
      ? 1
      : Number(item.stockQuantity);

    return {
      ...item,
      quantity: Math.min(Math.max(1, quantity), maxQuantity),
    };
  });

  return saveCart(cart);
}

export function removeFromCart(productId) {
  return saveCart(
    getCart().filter((item) => item.productId !== productId)
  );
}

export function removePurchasedItems(productIds) {
  const purchased = new Set(productIds);
  return saveCart(
    getCart().filter((item) => !purchased.has(item.productId))
  );
}
