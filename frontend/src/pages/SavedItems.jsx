import {
  useEffect,
  useState,
} from "react";

import {
  api,
} from "../api";

import ProductGrid from
  "../components/ProductGrid";

export default function SavedItems() {
  const [items, setItems] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSavedItems() {
      try {
        setLoading(true);
        setError("");

        const response = await api(
          "/api/saved-items"
        );

        if (!cancelled) {
          setItems(
            response.items ||
              response ||
              []
          );
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError.message
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSavedItems();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>Saved products</h1>

      {loading && (
        <p className="empty">
          Loading saved products...
        </p>
      )}

      {error && (
        <p className="error">
          {error}
        </p>
      )}

      {!loading && !error && (
        <ProductGrid
          products={items}
          empty="No saved products yet."
        />
      )}
    </main>
  );
}