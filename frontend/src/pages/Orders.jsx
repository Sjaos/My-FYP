import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API, api } from "../api";
import "./orders.css";

function formatDate(value) {
  if (!value) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClass(status) {
  return `order-status order-status-${String(status || "")
    .toLowerCase()
    .replace(/\s+/g, "-")}`;
}

export default function Orders({ sellerView = false }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadOrders() {
      try {
        setLoading(true);
        setError("");
        const response = await api(
          sellerView ? "/api/orders/seller" : "/api/orders"
        );

        if (!cancelled) {
          setOrders(response.orders || []);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError.message ||
              "Your orders could not be loaded."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadOrders();

    return () => {
      cancelled = true;
    };
  }, [sellerView]);

  async function updateOrder(order, status) {
    try {
      setUpdatingOrderId(order.id);
      setError("");
      setNotice("");
      const response = await api(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setNotice(response.message);
      const refreshed = await api(
        sellerView ? "/api/orders/seller" : "/api/orders"
      );
      setOrders(refreshed.orders || []);
    } catch (requestError) {
      setError(requestError.message || "Order status could not be updated.");
    } finally {
      setUpdatingOrderId("");
    }
  }

  return (
    <main>
      <div className="listings-heading">
        <div>
          <h1>{sellerView ? "Customer Orders" : "My Orders"}</h1>
          <p className="muted">
            {sellerView
              ? "Review customer purchases and update fulfilment status."
              : "Review your purchases and delivery details."}
          </p>
        </div>
        <Link className="secondary-button" to="/">
          Continue Shopping
        </Link>
      </div>

      {loading && (
        <p className="empty" role="status">
          Loading your orders...
        </p>
      )}

      {error && (
        <div>
          <p className="error" role="alert">{error}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </div>
      )}

      {notice && <p className="notice" role="status">{notice}</p>}

      {!loading && !error && orders.length === 0 && (
        <section className="orders-empty">
          <h2>{sellerView ? "No customer orders yet" : "No orders yet"}</h2>
          <p className="muted">
            Products you order will appear here.
          </p>
          <Link className="button" to="/">
            Browse Products
          </Link>
        </section>
      )}

      {!loading && !error && orders.length > 0 && (
        <section className="orders-list" aria-label="Order history">
          {orders.map((order) => {
            const product = order.productSnapshot || {};
            const imageUrl = product.imageUrl
              ? product.imageUrl.startsWith("http")
                ? product.imageUrl
                : `${API}${product.imageUrl}`
              : "";

            return (
              <article className="order-card" key={order.id}>
                <div className="order-card-heading">
                  <div>
                    <strong>Order #{order.id}</strong>
                    <p className="muted">{formatDate(order.createdAt)}</p>
                  </div>
                  <span className={statusClass(order.orderStatus)}>
                    {order.orderStatus || "Status unavailable"}
                  </span>
                </div>

                <div className="order-card-content">
                  {imageUrl ? (
                    <img
                      className="order-product-image"
                      src={imageUrl}
                      alt={product.title || "Ordered product"}
                    />
                  ) : (
                    <div className="order-product-placeholder">
                      No image
                    </div>
                  )}
                  <div className="order-product-info">
                    {order.productId ? (
                      <Link to={`/products/${order.productId}`}>
                        <h2>{product.title || "Product"}</h2>
                      </Link>
                    ) : (
                      <h2>{product.title || "Product"}</h2>
                    )}
                    {product.category && (
                      <p className="muted">{product.category}</p>
                    )}
                    {product.price != null && (
                      <p className="order-price">
                        Qty {product.quantity || 1} · PKR {Number(
                          product.lineTotal ?? Number(product.price) * (product.quantity || 1)
                        ).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>

                <div className="order-card-footer">
                  <span>
                    Payment: {order.paymentStatus || "Not available"}
                  </span>
                  {sellerView && order.shippingInfo && (
                    <span>
                      Ship to: {order.shippingInfo.fullName},{" "}
                      {order.shippingInfo.phone},{" "}
                      {order.shippingInfo.address}, {order.shippingInfo.city}
                    </span>
                  )}
                  {order.shippingInfo?.city && (
                    !sellerView && <span>Delivery city: {order.shippingInfo.city}</span>
                  )}
                </div>

                <div className="order-actions">
                  {!sellerView && order.orderStatus === "Placed" && (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={updatingOrderId === order.id}
                      onClick={() => updateOrder(order, "Cancelled")}
                    >
                      {updatingOrderId === order.id ? "Updating..." : "Cancel Order"}
                    </button>
                  )}
                  {sellerView && order.orderStatus === "Placed" && (
                    <>
                      <button
                        type="button"
                        className="button"
                        disabled={updatingOrderId === order.id}
                        onClick={() => updateOrder(order, "Confirmed")}
                      >
                        Confirm Order
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={updatingOrderId === order.id}
                        onClick={() => updateOrder(order, "Cancelled")}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  {sellerView && order.orderStatus === "Confirmed" && (
                    <>
                      <button
                        type="button"
                        className="button"
                        disabled={updatingOrderId === order.id}
                        onClick={() => updateOrder(order, "Shipped")}
                      >
                        Mark Shipped
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={updatingOrderId === order.id}
                        onClick={() => updateOrder(order, "Cancelled")}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  {sellerView && order.orderStatus === "Shipped" && (
                    <button
                      type="button"
                      className="button"
                      disabled={updatingOrderId === order.id}
                      onClick={() => updateOrder(order, "Delivered")}
                    >
                      Mark Delivered
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
