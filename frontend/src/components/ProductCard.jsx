import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API, api, currentUser } from "../api";

export default function ProductCard({ product, reason, viewMode = "gallery" }) {
  const navigate = useNavigate();
  const user = currentUser();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const image = product.imageUrl
    ? product.imageUrl.startsWith("http") ? product.imageUrl : `${API}${product.imageUrl}`
    : "";

  useEffect(() => {
    let cancelled = false;
    if (user?.role !== "buyer") return undefined;
    api(`/api/saved-items/status/${product.id}`)
      .then((response) => { if (!cancelled) setSaved(Boolean(response.saved)); })
      .catch(() => { if (!cancelled) setSaved(false); });
    return () => { cancelled = true; };
  }, [product.id, user?.role]);

  async function toggleSave(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!user) {
      sessionStorage.setItem("afterLogin", "/");
      navigate("/login", { state: { message: "Login as a buyer to save products." } });
      return;
    }
    if (user.role !== "buyer") return;
    try {
      setSaving(true);
      if (saved) {
        await api(`/api/saved-items/${product.id}`, { method: "DELETE" });
        setSaved(false);
      } else {
        await api("/api/saved-items", {
          method: "POST",
          body: JSON.stringify({ productId: product.id }),
        });
        setSaved(true);
      }
    } catch (error) {
      window.alert(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className={`product-card ${viewMode === "list" ? "list-card" : ""}`}>
      <div className="product-photo">
        <Link to={`/products/${product.id}`} className="product-image-link">
          {image ? <img src={image} alt={product.title} /> : <div className="photo-fallback">{product.category?.slice(0, 1) || "S"}</div>}
        </Link>
        {(user?.role === "buyer" || !user) && (
          <button type="button" className={`heart ${saved ? "saved" : ""}`} onClick={toggleSave} disabled={saving} aria-label={saved ? "Remove from saved products" : "Save product"}>{saved ? "♥" : "♡"}</button>
        )}
        <span className={`condition ${product.condition === "New" ? "new" : "used"}`}>{product.condition || "Used"}</span>
      </div>
      <div className="product-info">
        <Link to={`/products/${product.id}`}><h3>{product.title}</h3></Link>
        <strong>PKR {Number(product.price).toLocaleString()}</strong>
        {product.sellerName && <p>{product.sellerName}</p>}
        <div className="meta"><span>{product.category}</span><span>{product.sellerType === "business_seller" ? "Business seller" : "Individual seller"}</span></div>
        {product.sellerType === "business_seller" && <small>{product.stockQuantity} in stock</small>}
        {product.sellerType === "individual_seller" && product.itemCondition && <small>{product.itemCondition}{product.location ? ` · ${product.location}` : ""}</small>}
        {reason && <small className="reason">{reason}</small>}
      </div>
    </article>
  );
}
