import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { API, api } from "../api";
import { getCart, removePurchasedItems } from "../utils/cart";
import "./orders.css";

const emptyShippingInfo = {
  fullName: "",
  phone: "",
  address: "",
  city: "",
};

function clean(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function validateShipping(info) {
  const cleaned = {
    fullName: clean(info.fullName),
    phone: String(info.phone || "").trim().replace(/[\s()-]/g, ""),
    address: clean(info.address),
    city: clean(info.city),
  };
  const errors = {};

  if (cleaned.fullName.length < 2 || cleaned.fullName.length > 80) {
    errors.fullName = "Full name must be between 2 and 80 characters.";
  } else if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+$/.test(cleaned.fullName)) {
    errors.fullName = "Full name can contain only letters, spaces, apostrophes, dots and hyphens.";
  }

  if (!/^(?:\+92|92|0)3\d{9}$/.test(cleaned.phone)) {
    errors.phone = "Enter a valid number like 03001234567 or +923001234567.";
  }

  if (cleaned.address.length < 10 || cleaned.address.length > 200) {
    errors.address = "Address must be between 10 and 200 characters.";
  }

  if (cleaned.city.length < 2 || cleaned.city.length > 60) {
    errors.city = "City must be between 2 and 60 characters.";
  } else if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+$/.test(cleaned.city)) {
    errors.city = "City can contain only letters, spaces, apostrophes, dots and hyphens.";
  }

  return { cleaned, errors };
}

export default function Checkout() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [shippingInfo, setShippingInfo] = useState(emptyShippingInfo);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [addressWarning, setAddressWarning] = useState("");
  const [placedOrders, setPlacedOrders] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadCheckoutData() {
      try {
        setLoading(true);
        setError("");
        const cartItems = productId
          ? [{ productId, quantity: 1 }]
          : getCart();

        if (!cartItems.length) {
          setItems([]);
          return;
        }

        const productRequests = cartItems.map(async (item) => {
          const product = await api(`/api/products/${item.productId}`);
          return { ...item, product };
        });

        const [loadedItems, addressResult] = await Promise.all([
          Promise.all(productRequests),
          api("/api/orders/address")
            .then((response) => ({ response }))
            .catch((requestError) => ({ error: requestError })),
        ]);

        if (cancelled) {
          return;
        }

        setItems(loadedItems);
        if (addressResult.error) {
          setAddressWarning(
            `${addressResult.error.message} Enter your delivery details below to continue.`
          );
        } else if (addressResult.response.shippingInfo) {
          setShippingInfo({
            ...emptyShippingInfo,
            ...addressResult.response.shippingInfo,
          });
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Checkout data could not be loaded.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCheckoutData();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  function handleChange(event) {
    const { name, value } = event.target;
    setShippingInfo((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: "" }));
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const { cleaned, errors } = validateShipping(shippingInfo);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      return;
    }
    if (!items.length) {
      setError("Your cart is empty.");
      return;
    }

    try {
      setSubmitting(true);
      const response = await api("/api/orders/place", {
        method: "POST",
        body: JSON.stringify({
          items: items.map(({ product, productId: id, quantity }) => ({
            productId: id || product.id,
            quantity,
          })),
          ...cleaned,
        }),
      });

      setShippingInfo(cleaned);
      setPlacedOrders(response.orders || []);
      if (!productId) {
        removePurchasedItems(items.map((item) => item.productId));
      }
    } catch (requestError) {
      setError(requestError.message || "Order could not be placed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <main><p className="empty">Loading checkout...</p></main>;
  }

  if (error && !items.length) {
    return (
      <main className="narrow">
        <p className="error" role="alert">{error}</p>
        <Link className="button" to="/cart">Back to Cart</Link>
      </main>
    );
  }

  if (placedOrders.length) {
    return (
      <main className="narrow">
        <section className="orders-empty checkout-success">
          <h1>Order placed successfully!</h1>
          <p>
            {placedOrders.length === 1
              ? "Your order has been confirmed."
              : `${placedOrders.length} orders have been placed with the respective sellers.`}
          </p>
          {placedOrders.map((order) => (
            <p key={order.id}>
              <strong>Order ID:</strong> {order.id}
            </p>
          ))}
          <p>
            <strong>Delivery address:</strong>{" "}
            {shippingInfo.address}, {shippingInfo.city}
          </p>
          <p>Payment method: Cash on Delivery</p>
          <Link className="button" to="/orders">View My Orders</Link>
        </section>
      </main>
    );
  }

  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.product.price) * item.quantity,
    0
  );

  return (
    <main className="checkout-page">
      <h1>Checkout &amp; Delivery Information</h1>
      <p className="muted">Confirm your items and enter complete delivery details.</p>

      {error && <p className="error" role="alert">{error}</p>}
      {addressWarning && <p className="notice" role="status">{addressWarning}</p>}

      <section className="orders-list checkout-items" aria-label="Checkout items">
        {items.map(({ product, productId: id, quantity }) => {
          const imageUrl = product.imageUrl
            ? product.imageUrl.startsWith("http")
              ? product.imageUrl
              : `${API}${product.imageUrl}`
            : "";
          const available = Number(product.stockQuantity);
          const unavailable =
            product.status !== "active" ||
            available < quantity ||
            product.sellingMethod !== "fixed_price";

          return (
            <article className="order-card" key={id || product.id}>
              <div className="order-card-content">
                {imageUrl
                  ? <img className="order-product-image" src={imageUrl} alt={product.title} />
                  : <div className="order-product-placeholder">No image</div>}
                <div className="order-product-info">
                  <h2>{product.title}</h2>
                  <p>Quantity: {quantity}</p>
                  <p className="order-price">
                    PKR {(Number(product.price) * quantity).toLocaleString()}
                  </p>
                  {unavailable && (
                    <p className="error">
                      This item is out of stock or is not available at a fixed price.
                    </p>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <p className="checkout-total">
        <strong>Order total: PKR {subtotal.toLocaleString()}</strong>
      </p>

      <form className="checkout-form" onSubmit={handleSubmit} noValidate>
        <label>
          Full Name
          <input
            name="fullName"
            value={shippingInfo.fullName}
            onChange={handleChange}
            autoComplete="name"
            maxLength="80"
            required
          />
          {fieldErrors.fullName && <small className="field-error">{fieldErrors.fullName}</small>}
        </label>

        <label>
          Phone Number
          <input
            type="tel"
            name="phone"
            value={shippingInfo.phone}
            onChange={handleChange}
            placeholder="03001234567"
            autoComplete="tel"
            required
          />
          {fieldErrors.phone && <small className="field-error">{fieldErrors.phone}</small>}
        </label>

        <label>
          Shipping Address
          <textarea
            name="address"
            value={shippingInfo.address}
            onChange={handleChange}
            rows="4"
            maxLength="200"
            autoComplete="street-address"
            required
          />
          {fieldErrors.address && <small className="field-error">{fieldErrors.address}</small>}
        </label>

        <label>
          City
          <input
            name="city"
            value={shippingInfo.city}
            onChange={handleChange}
            autoComplete="address-level2"
            maxLength="60"
            required
          />
          {fieldErrors.city && <small className="field-error">{fieldErrors.city}</small>}
        </label>

        <div className="checkout-payment">
          <strong>Payment method:</strong> Cash on Delivery
        </div>

        <button
          type="submit"
          className="button block"
          disabled={submitting || !items.length || items.some(({ product, quantity }) =>
            product.status !== "active" ||
            Number(product.stockQuantity) < quantity ||
            product.sellingMethod !== "fixed_price"
          )}
        >
          {submitting ? "Placing Order..." : "Confirm & Place Order"}
        </button>
        <Link className="secondary-button block checkout-cancel" to={productId ? `/products/${productId}` : "/cart"}>
          Back
        </Link>
      </form>
    </main>
  );
}
