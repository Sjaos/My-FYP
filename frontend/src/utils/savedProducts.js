const STORAGE_KEY = "selbuySavedProductIds";

export function getSavedProductIds() {
  try {
    const savedData = localStorage.getItem(STORAGE_KEY);

    if (!savedData) {
      return [];
    }

    const parsedData = JSON.parse(savedData);

    return Array.isArray(parsedData) ? parsedData : [];
  } catch (error) {
    console.error("Could not read saved products:", error);
    return [];
  }
}

export function isProductSaved(productId) {
  const savedIds = getSavedProductIds();

  return savedIds.includes(productId);
}

export function saveProduct(productId) {
  const savedIds = getSavedProductIds();

  if (savedIds.includes(productId)) {
    return savedIds;
  }

  const updatedIds = [...savedIds, productId];

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(updatedIds)
  );

  window.dispatchEvent(new Event("savedProductsChanged"));

  return updatedIds;
}

export function removeSavedProduct(productId) {
  const savedIds = getSavedProductIds();

  const updatedIds = savedIds.filter(
    (savedId) => savedId !== productId
  );

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(updatedIds)
  );

  window.dispatchEvent(new Event("savedProductsChanged"));

  return updatedIds;
}

export function toggleSavedProduct(productId) {
  if (isProductSaved(productId)) {
    return removeSavedProduct(productId);
  }

  return saveProduct(productId);
}