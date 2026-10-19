import { useEffect, useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  API,
  api,
  currentUser,
} from "../api";
import { addToCart } from "../utils/cart";
import ProductGrid from "../components/ProductGrid";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = currentUser();

  const [product, setProduct] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [saved, setSaved] = useState(false);

  const [checkingSaved, setCheckingSaved] =
    useState(true);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProduct() {
      try {
        setError("");

        const productData = await api(
          `/api/products/${id}`
        );

        if (!cancelled) {
          setProduct(productData);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message);
        }
      }
    }

    async function loadSimilarProducts() {
      try {
        const response = await api(
          `/api/recommendations/similar/${id}?limit=4`
        );

        if (!cancelled) {
          setSimilar(
            response.recommendations ||
              response ||
              []
          );
        }
      } catch {
        if (!cancelled) {
          setSimilar([]);
        }
      }
    }

    async function checkSavedStatus() {
      if (user?.role !== "buyer") {
        setCheckingSaved(false);
        return;
      }

      try {
        const response = await api(
          `/api/saved-items/status/${id}`
        );

        if (!cancelled) {
          setSaved(Boolean(response.saved));
        }
      } catch {
        if (!cancelled) {
          setSaved(false);
        }
      } finally {
        if (!cancelled) {
          setCheckingSaved(false);
        }
      }
    }

    async function recordView() {
      if (user?.role !== "buyer") {
        return;
      }

      try {
        await api("/api/interactions", {
          method: "POST",
          body: JSON.stringify({
            productId: id,
            type: "view",
          }),
        });
      } catch {
        // View tracking fail hone par
        // product page block nahi hoga.
      }
    }

    loadProduct();
    loadSimilarProducts();
    checkSavedStatus();
    recordView();

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function toggleSave() {
    if (!user) {
      sessionStorage.setItem(
        "afterLogin",
        `/products/${id}`
      );

      navigate("/login", {
        state: {
          message:
            "Login as buyer to save this product.",
        },
      });

      return;
    }

    if (user.role !== "buyer") {
      setMessage(
        "Only buyer accounts can save products."
      );
      return;
    }

    try {
      setSaving(true);
      setMessage("");

      if (saved) {
        const response = await api(
          `/api/saved-items/${id}`,
          {
            method: "DELETE",
          }
        );

        setSaved(false);

        setMessage(
          response.message ||
            "Product removed from saved items."
        );
      } else {
        const response = await api(
          "/api/saved-items",
          {
            method: "POST",
            body: JSON.stringify({
              productId: id,
            }),
          }
        );

        setSaved(true);

        setMessage(
          response.message ||
            "Product saved successfully."
        );
      }
    } catch (requestError) {
      setMessage(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  function buyNow() {
    if (!user) {
      sessionStorage.setItem(
        "afterLogin",
        `/checkout/${id}`
      );

      navigate("/login", {
        state: {
          message:
            "Please login as a buyer to purchase items.",
        },
      });

      return;
    }

    if (user.role !== "buyer") {
      setMessage(
        "Only buyer accounts can purchase products."
      );
      return;
    }

    if (product.status !== "active" || Number(product.stockQuantity) < 1) {
      setMessage("This product is currently out of stock.");
      return;
    }

    navigate(`/checkout/${id}`);
  }

  function addProductToCart() {
    if (product.status !== "active" || Number(product.stockQuantity) < 1) {
      setMessage("This product is currently out of stock.");
      return;
    }

    addToCart(product);
    setMessage("Product added to your cart.");
  }

  if (error) {
    return (
      <main>
        <p className="error">
          {error}
        </p>
      </main>
    );
  }

  if (!product) {
    return (
      <main>
        <p className="empty">
          Loading product...
        </p>
      </main>
    );
  }

  const productImageUrl = product.imageUrl
    ? product.imageUrl.startsWith("http")
      ? product.imageUrl
      : `${API}${product.imageUrl}`
    : "";

  return (
    <main>
      <div className="detail">
        <div>
          {productImageUrl ? (
            <img
              src={productImageUrl}
              alt={product.title}
            />
          ) : (
            <div className="placeholder large">
              No image
            </div>
          )}
        </div>

        <section className="panel">
          <span className="tag">
            {product.category}
          </span>

          <h1>{product.title}</h1>

          <p>{product.description}</p>

          <dl>
            <div>
              <dt>Condition</dt>
              <dd>
                {product.condition === "Used"
                  ? product.itemCondition || "Used"
                  : "New"}
              </dd>
            </div>

            <div>
              <dt>Seller</dt>
              <dd>
                {product.sellerType === "business_seller"
                  ? "Business seller"
                  : "Individual seller"}
                {product.sellerName
                  ? ` · ${product.sellerName}`
                  : ""}
              </dd>
            </div>

            {product.sellerType === "business_seller" ? (
              <div>
                <dt>Availability</dt>
                <dd>
                  {Number(product.stockQuantity) > 0
                    ? `${product.stockQuantity} in stock`
                    : "Out of stock"}
                </dd>
              </div>
            ) : (
              <>
                {product.usageDuration && (
                  <div>
                    <dt>Usage duration</dt>
                    <dd>{product.usageDuration}</dd>
                  </div>
                )}
                {product.defects && (
                  <div>
                    <dt>Defects or wear</dt>
                    <dd>{product.defects}</dd>
                  </div>
                )}
                {product.location && (
                  <div>
                    <dt>Location</dt>
                    <dd>{product.location}</dd>
                  </div>
                )}
              </>
            )}

            <div>
              <dt>Price</dt>
              <dd>
                PKR{" "}
                {Number(
                  product.price
                ).toLocaleString()}
              </dd>
            </div>
          </dl>

          <button
            type="button"
            className="button block"
            onClick={buyNow}
            disabled={
              product.status !== "active" ||
              Number(product.stockQuantity) < 1
            }
            style={{ marginBottom: "10px" }}
          >
            Buy Now
          </button>

          <button
            type="button"
            className="secondary-button block"
            onClick={addProductToCart}
            disabled={
              product.status !== "active" ||
              Number(product.stockQuantity) < 1
            }
            style={{ marginBottom: "10px" }}
          >
            Add to Cart
          </button>

          <button
            type="button"
            className={`button block ${
              saved ? "unsave-button" : ""
            }`}
            onClick={toggleSave}
            disabled={
              saving || checkingSaved
            }
          >
            {checkingSaved
              ? "Checking..."
              : saving
              ? "Saving..."
              : saved
              ? "Unsave product"
              : "Save product"}
          </button>

          {message && (
            <p className="notice">
              {message}
            </p>
          )}
        </section>
      </div>

      <section>
        <h2>Similar products</h2>

        <ProductGrid
          products={similar}
          empty="No similar products available."
        />
      </section>
    </main>
  );
}