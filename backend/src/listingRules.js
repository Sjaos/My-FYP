export function listingStatusError(product, nextStatus) {
  if (
    product.status === "sold" &&
    nextStatus !== "sold"
  ) {
    return "Sold listings cannot be reactivated.";
  }

  if (
    nextStatus === "active" &&
    Number(product.stockQuantity) < 1
  ) {
    return "Add available stock before activating this listing.";
  }

  return null;
}
