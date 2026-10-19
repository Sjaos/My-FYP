import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API } from "../api";
import {
  getCart,
  removeFromCart,
  updateCartQuantity,
} from "../utils/cart";
import "./orders.css";

export default function Cart() {
  const [items, setItems] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const syncCart = () => setItems(getCart());
    syncCart();
    window.addEventListener("selbuy:cart-change", syncCart);
    window.addEventListener("storage", syncCart);
    return () => {
      window.removeEventListener("selbuy:cart-change", syncCart);
      window.removeEventListener("storage", syncCart);
    };
  }, []);

  function changeQuantity(item, value) {
    const quantity = Number(value);
    if (Number.isSafeInteger(quantity) && quantity >= 1) {
      setItems(updateCartQuantity(item.productId, quantity));
    }
  }

  function removeItem(productId) {
    setItems(removeFromCart(productId));
  }

  const total = items.reduce(
    (sum, item) => sum + Number(item.price || 0) * item.quantity,
    0
  );

  return (
    <main>
      <div className="listings-heading">
        <div>
          <h1>Your Cart</h1>
          <p className="muted">
            Review items and quantities before checkout.
          </p>
        </div>
        <Link className="secondary-button" to="/">
          Continue Shopping
        </Link>
      </div>

      {items.length === 0 ? (
        <section className="orders-empty">
          <h2>Your cart is empty</h2>
          <p className="muted">Add products to your cart to check out.</p>
          <Link className="button" to="/">Browse Products</Link>
        </section>
      ) : (
        <>
          <section className="orders-list" aria-label="Cart items">
            {items.map((item) => {
              const imageUrl = item.imageUrl
                ? item.imageUrl.startsWith("http")
                  ? item.imageUrl
                  : `${API}${item.imageUrl}`
                : "";
              const available = Number(item.stockQuantity);
              return (
                <article className="order-card" key={item.productId}>
                  <div className="order-card-content">
                    {imageUrl ? (
                      <img className="order-product-image" src={imageUrl} alt={item.title} />
                    ) : (
                      <div className="order-product-placeholder">No image</div>
                    )}
                    <div className="order-product-info cart-product-info">
                      <Link to={`/products/${item.productId}`}>
                        <h2>{item.title || "Product"}</h2>
                      </Link>
                      <p className="order-price">
                        PKR {Number(item.price).toLocaleString()}
                      </p>
                      <label className="cart-quantity">
                        Quantity
                        <input
                          type="number"
                          min="1"
                          max={available}
                          value={item.quantity}
                          disabled={item.sellerType === "individual_seller"}
                          onChange={(event) => changeQuantity(item, event.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className="cart-remove"
                        onClick={() => removeItem(item.productId)}
                      >
                        Remove
                      </button>
                    </div>
                    <strong className="cart-line-total">
                      PKR {(Number(item.price) * item.quantity).toLocaleString()}
                    </strong>
                  </div>
                  {available < item.quantity && (
                    <p className="error">
                      Cart quantity exceeds the saved stock. Edit it or remove this item.
                    </p>
                  )}
                </article>
              );
            })}
          </section>

          <section className="cart-summary">
            <strong>Estimated total</strong>
            <strong>PKR {total.toLocaleString()}</strong>
            <button
              type="button"
              className="button"
              onClick={() => navigate("/checkout")}
            >
              Proceed to Checkout
            </button>
          </section>
        </>
      )}
    </main>
  );
}
