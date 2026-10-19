import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, currentUser } from "../api";
import ProductGrid from "../components/ProductGrid";
import { PRODUCT_CATEGORIES } from "../constants/categories";

export default function Home({ filters, setFilters }) {
  const [products, setProducts] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [recommendationStatus, setRecommendationStatus] =
    useState("idle");
  const [recommendationSource, setRecommendationSource] =
    useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const user = currentUser();

  useEffect(() => {
    let cancelled = false;
    const parameters = new URLSearchParams();
    if (filters?.q) parameters.set("q", filters.q);
    if (filters?.category) parameters.set("category", filters.category);
    if (filters?.condition) parameters.set("condition", filters.condition);
    if (filters?.minPrice) parameters.set("minPrice", filters.minPrice);
    if (filters?.maxPrice) parameters.set("maxPrice", filters.maxPrice);
    if (filters?.isSale) parameters.set("isSale", "true");
    if (filters?.freeShipping) parameters.set("freeShipping", "true");
    if (filters?.sort) parameters.set("sort", filters.sort);

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        setError("");
        const response = await api(`/api/products?${parameters.toString()}`);
        if (!cancelled) setProducts(response || []);
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [filters]);

  useEffect(() => {
    let cancelled = false;

    if (user?.role !== "buyer") {
      setRecommended([]);
      setRecommendationStatus("idle");
      setRecommendationSource("");
      return () => {
        cancelled = true;
      };
    }

    setRecommendationStatus("loading");
    api("/api/recommendations?limit=5")
      .then((response) => {
        if (cancelled) return;
        const results = response.recommendations || [];
        setRecommended(results);
        setRecommendationSource(
          response.recommendationSource || ""
        );
        setRecommendationStatus(
          results.length ? "ready" : "empty"
        );
      })
      .catch(() => {
        if (cancelled) return;
        setRecommended([]);
        setRecommendationStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role]);

  const newProducts = useMemo(() => products.filter((product) => product.condition === "New").slice(0, 5), [products]);
  const usedProducts = useMemo(() => products.filter((product) => product.condition === "Used").slice(0, 2), [products]);
  const previewProducts = products.slice(0, 5);

  function selectCategory(category) {
    setFilters?.((previous) => ({ ...previous, q: "", category, condition: "" }));
  }

  return (
    <main className="home-page">
      <section className="home-hero shell">
        <aside className="category-sidebar">
          <button type="button" className="category-heading" onClick={() => selectCategory("")}><span>☰ All Categories</span><b>›</b></button>
          {PRODUCT_CATEGORIES.map((category) => <button type="button" key={category} onClick={() => selectCategory(category)}><span>{category}</span><b>›</b></button>)}
        </aside>
        <div className="hero-banner">
          <div className="hero-text">
            <span className="hero-kicker">AI-DRIVEN HYBRID MARKETPLACE</span>
            <h1>Shop New.<br />Buy <em>Used.</em> <strong>Choose Smart.</strong></h1>
            <p>Discover new and pre-owned products with personalized recommendations.</p>
            <div className="hero-buttons"><a className="button" href="#new-products">Shop New Products</a><a className="outline-button" href="#used-products">Explore Used Products</a></div>
          </div>
          <div className="hero-visuals">
            <div className="visual-card visual-new"><div><b>New Products</b><small>fresh marketplace listings</small></div><span>🎧</span></div>
            <div className="visual-card visual-used"><div><b>Used Products</b><small>clear product condition details</small></div><span>📷</span></div>
          </div>
        </div>
      </section>

      <section className="benefits shell">
        <div><i>✦</i><span><b>AI-Powered</b><small>Recommendations</small></span></div>
        <div><i>⌕</i><span><b>Smart Search</b><small>Find products quickly</small></span></div>
        <div><i>♡</i><span><b>Saved Products</b><small>Keep your favorites</small></span></div>
        <div><i>✓</i><span><b>Clear Listings</b><small>Condition and category</small></span></div>
        <div><i>▣</i><span><b>Simple Checkout</b><small>Place an order easily</small></span></div>
      </section>

      <div className="shell content-sections">
        <section id="top-picks" className="catalog-section">
          <div className="section-title"><div><h2>{user?.role === "buyer" ? "Top Picks for You" : "Recently Listed"}</h2><p>{user?.role === "buyer" ? "Suggestions based on your interests and activity" : "Explore the latest marketplace listings"}</p>
            {recommendationSource === "selbuy-live-catalog-hybrid" && <small className="muted">Personalized from Selbuy products and marketplace activity.</small>}
            {recommendationSource === "javascript-fallback" && <small className="muted">Using the marketplace fallback recommender.</small>}
            {recommendationSource === "fastapi-trained-model" && <small className="muted">Ranked by the trained recommendation model.</small>}
            {recommendationSource === "trained-model-and-fallback" && <small className="muted">Ranked using the trained model with marketplace fallback results.</small>}
          </div>{user?.role === "buyer" ? <Link to="/recommendations">View All →</Link> : <Link to="/login">Sign in for recommendations →</Link>}</div>
          {user?.role === "buyer" && recommendationStatus === "loading" ? <p className="empty">Loading your recommendations...</p>
            : user?.role === "buyer" && recommendationStatus === "error" ? <p className="error">Your recommendations could not be loaded. Please try again later.</p>
              : user?.role === "buyer" && recommendationStatus === "empty" ? <p className="empty">No personalized recommendations are available yet.</p>
                : <ProductGrid products={user?.role === "buyer" ? recommended : previewProducts} empty="No products available." />}
        </section>

        <section id="new-products" className="catalog-section">
          <div className="section-title"><div><h2>New Products</h2><p>Browse recently listed new products</p></div><button className="section-link-button" type="button" onClick={() => setFilters?.((p) => ({ ...p, q: "", category: "", condition: "New" }))}>View All →</button></div>
          {error ? <p className="error">{error}</p> : loading ? <p className="empty">Loading products...</p> : <ProductGrid products={newProducts.length ? newProducts : previewProducts} />}
        </section>

        <section id="used-products" className="used-feature">
          <div className="used-copy"><span>SMART CHOICE</span><h2>Great Deals on<br />Pre-Owned Products</h2><p>Browse used products with clear condition information.</p><button type="button" className="outline-button" onClick={() => setFilters?.((p) => ({ ...p, q: "", category: "", condition: "Used" }))}>Explore Used Products</button></div>
          <div className="used-grid"><ProductGrid products={usedProducts.length ? usedProducts : previewProducts.slice(0, 2)} /></div>
        </section>

        <section id="products" className="catalog-section">
          <div className="section-title"><div><h2>Explore Products</h2><p>{filters?.category || filters?.condition || filters?.q ? "Filtered marketplace results" : "Fresh marketplace listings"}</p></div><span>{products.length} Products</span></div>
          {!loading && !error && <ProductGrid products={products} viewMode={filters?.viewMode} />}
        </section>
      </div>
    </main>
  );
}
