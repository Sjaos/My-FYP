import {
  useEffect,
  useState,
} from "react";
import {
  Link,
  useLocation,
} from "react-router-dom";

import {
  API,
  api,
  currentUser,
} from "../api";

export default function MyListings() {
  const location = useLocation();
  const isBusinessSeller =
    currentUser()?.role === "business_seller";

  const [items, setItems] =
    useState([]);
  const [summary, setSummary] =
    useState({
      total: 0,
      active: 0,
      inactive: 0,
      sold: 0,
    });
  const [filter, setFilter] =
    useState("all");
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState("");
  const [message, setMessage] =
    useState(
      location.state?.message || ""
    );

  async function loadListings() {
    try {
      setLoading(true);
      setError("");

      const [
        productsResponse,
        summaryResponse,
      ] = await Promise.all([
        api("/api/products/mine"),
        api("/api/products/mine/summary"),
      ]);

      setItems(productsResponse);
      setSummary(summaryResponse);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadListings();
  }, []);

  async function changeStatus(
    productId,
    status
  ) {
    try {
      setError("");
      setMessage("");

      const response = await api(
        `/api/products/${productId}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status,
          }),
        }
      );

      setMessage(response.message);
      await loadListings();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function deleteListing(
    product
  ) {
    const confirmed = window.confirm(
      `Permanently delete "${product.title}"? This action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setError("");
      setMessage("");

      const response = await api(
        `/api/products/${product.id}`,
        {
          method: "DELETE",
        }
      );

      setMessage(response.message);
      await loadListings();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const visibleItems =
    filter === "all"
      ? items
      : items.filter(
          (product) =>
            product.status === filter
        );

  if (loading) {
    return (
      <main>
        <p className="empty">
          Loading your listings...
        </p>
      </main>
    );
  }

  return (
    <main>
      <div className="listings-heading">
        <div>
          <h1>My Listings</h1>
          <p className="muted">
            {isBusinessSeller
              ? "Manage new products, fixed prices and available stock."
              : "Manage your pre-owned listings and their condition details."}
          </p>
        </div>

        <Link
          className="button"
          to="/sell"
        >
          Add New Product
        </Link>
      </div>

      {message && (
        <p className="notice">{message}</p>
      )}

      {error && (
        <p className="error">{error}</p>
      )}

      <section className="listing-summary">
        <button
          type="button"
          className={
            filter === "all"
              ? "summary-card selected"
              : "summary-card"
          }
          onClick={() => setFilter("all")}
        >
          <strong>{summary.total}</strong>
          <span>Total</span>
        </button>

        <button
          type="button"
          className={
            filter === "active"
              ? "summary-card selected"
              : "summary-card"
          }
          onClick={() =>
            setFilter("active")
          }
        >
          <strong>{summary.active}</strong>
          <span>Active</span>
        </button>

        <button
          type="button"
          className={
            filter === "inactive"
              ? "summary-card selected"
              : "summary-card"
          }
          onClick={() =>
            setFilter("inactive")
          }
        >
          <strong>
            {summary.inactive}
          </strong>
          <span>Inactive</span>
        </button>

        <button
          type="button"
          className={
            filter === "sold"
              ? "summary-card selected"
              : "summary-card"
          }
          onClick={() =>
            setFilter("sold")
          }
        >
          <strong>{summary.sold}</strong>
          <span>Sold</span>
        </button>
      </section>

      {visibleItems.length === 0 ? (
        <div className="empty">
          <p>
            No {filter === "all" ? "" : filter}{" "}
            listings found.
          </p>

          {items.length === 0 && (
            <Link
              className="button"
              to="/sell"
            >
              Create First Listing
            </Link>
          )}
        </div>
      ) : (
        <section className="seller-listings">
          {visibleItems.map((product) => (
            <article
              className="seller-listing-card"
              key={product.id}
            >
              <div className="seller-listing-image">
                {product.imageUrl ? (
                  <img
                    src={
                      product.imageUrl.startsWith(
                        "http"
                      )
                        ? product.imageUrl
                        : `${API}${product.imageUrl}`
                    }
                    alt={product.title}
                  />
                ) : (
                  <div className="placeholder">
                    No image
                  </div>
                )}
              </div>

              <div className="seller-listing-content">
                <div className="seller-listing-top">
                  <div>
                    <span
                      className={`listing-status ${product.status}`}
                    >
                      {product.status}
                    </span>

                    <h3>{product.title}</h3>
                  </div>

                  <strong className="listing-price">
                    PKR{" "}
                    {Number(
                      product.price
                    ).toLocaleString()}
                  </strong>
                </div>

                <p className="muted">
                  {product.category}
                  {` • ${product.condition}`}
                  {product.sellerType === "business_seller"
                    ? ` • ${product.stockQuantity} in stock`
                    : ` • ${product.itemCondition || "Condition not set"} • ${product.location || "Location not set"}`}
                </p>

                <p className="listing-description">
                  {product.description}
                </p>

                <div className="tags-wrap">
                  {product.isSale && (
                    <span className="tag sale-tag">
                      Sale
                    </span>
                  )}

                  {product.freeShipping && (
                    <span className="tag shipping-tag">
                      Free Shipping
                    </span>
                  )}
                </div>

                <div className="listing-actions">
                  <Link
                    className="small-action edit-action"
                    to={`/products/${product.id}/edit`}
                  >
                    Edit
                  </Link>

                  {product.status ===
                    "inactive" && (
                    <button
                      type="button"
                      className="small-action activate-action"
                      onClick={() =>
                        changeStatus(
                          product.id,
                          "active"
                        )
                      }
                    >
                      Activate
                    </button>
                  )}

                  {product.status ===
                    "active" && (
                    <button
                      type="button"
                      className="small-action pause-action"
                      onClick={() =>
                        changeStatus(
                          product.id,
                          "inactive"
                        )
                      }
                    >
                      Deactivate
                    </button>
                  )}

                  {product.status !==
                    "sold" && (
                    <button
                      type="button"
                      className="small-action sold-action"
                      onClick={() =>
                        changeStatus(
                          product.id,
                          "sold"
                        )
                      }
                    >
                      Mark Sold
                    </button>
                  )}

                  <button
                    type="button"
                    className="small-action delete-action"
                    onClick={() =>
                      deleteListing(product)
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}