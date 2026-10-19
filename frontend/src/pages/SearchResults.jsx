import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import ProductGrid from "../components/ProductGrid";
import { PRODUCT_CATEGORIES } from "../constants/categories";

export default function SearchResults() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("gallery");
  const [priceInputs, setPriceInputs] = useState({
    minPrice: searchParams.get("minPrice") || "",
    maxPrice: searchParams.get("maxPrice") || "",
  });

  const query = searchParams.get("q") || "";
  const category = searchParams.get("category") || "";
  const condition = searchParams.get("condition") || "";
  const sellerType = searchParams.get("sellerType") || "";
  const isSale = searchParams.get("isSale") === "true";
  const freeShipping = searchParams.get("freeShipping") === "true";
  const minPrice = searchParams.get("minPrice") || "";
  const maxPrice = searchParams.get("maxPrice") || "";
  const sort = searchParams.get("sort") || "newest";

  useEffect(() => {
    setPriceInputs({ minPrice, maxPrice });
  }, [minPrice, maxPrice]);

  useEffect(() => {
    let cancelled = false;
    async function loadProducts() {
      try {
        setLoading(true);
        setError("");
        const parameters = new URLSearchParams();
        if (query) parameters.set("q", query);
        if (category) parameters.set("category", category);
        if (condition) parameters.set("condition", condition);
        if (sellerType) parameters.set("sellerType", sellerType);
        if (isSale) parameters.set("isSale", "true");
        if (freeShipping) parameters.set("freeShipping", "true");
        if (minPrice) parameters.set("minPrice", minPrice);
        if (maxPrice) parameters.set("maxPrice", maxPrice);
        parameters.set("sort", sort);
        const response = await api(`/api/products?${parameters.toString()}`);
        if (!cancelled) setProducts(response || []);
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadProducts();
    return () => { cancelled = true; };
  }, [query, category, condition, sellerType, isSale, freeShipping, minPrice, maxPrice, sort]);

  function setParam(name, value) {
    const next = new URLSearchParams(searchParams);
    if (value === "" || value === false || value === null) next.delete(name);
    else next.set(name, String(value));
    setSearchParams(next);
  }

  function applyPrice(event) {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (priceInputs.minPrice) next.set("minPrice", priceInputs.minPrice); else next.delete("minPrice");
    if (priceInputs.maxPrice) next.set("maxPrice", priceInputs.maxPrice); else next.delete("maxPrice");
    setSearchParams(next);
  }

  function clearAll() {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    setPriceInputs({ minPrice: "", maxPrice: "" });
    setSearchParams(next);
  }

  const title = query ? `Search results for “${query}”` : category || (condition ? `${condition} Products` : isSale ? "Deals" : "All Products");

  return (
    <main className="search-results-page">
      <div className="results-breadcrumb">Home <span>›</span> Products {category && <><span>›</span> {category}</>}</div>
      <div className="results-title-row">
        <div><h1>{title}</h1><p className="muted">{loading ? "Searching products..." : `${products.length} product${products.length === 1 ? "" : "s"} found`}</p></div>
        <div className="results-toolbar">
          <label>Sort by<select value={sort} onChange={(event) => setParam("sort", event.target.value)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="price_asc">Price: Low to High</option><option value="price_desc">Price: High to Low</option></select></label>
          <div className="view-switch"><button type="button" className={viewMode === "gallery" ? "selected" : ""} onClick={() => setViewMode("gallery")}>▦</button><button type="button" className={viewMode === "list" ? "selected" : ""} onClick={() => setViewMode("list")}>☷</button></div>
        </div>
      </div>

      <div className="results-layout">
        <aside className="filters-panel">
          <div className="filters-heading"><strong>Filters</strong><button type="button" onClick={clearAll}>Clear All</button></div>

          <section className="filter-group">
            <h3>Product Type</h3>
            <label className="filter-check"><input type="radio" name="condition" checked={condition === "New"} onChange={() => setParam("condition", "New")} /> New</label>
            <label className="filter-check"><input type="radio" name="condition" checked={condition === "Used"} onChange={() => setParam("condition", "Used")} /> Used</label>
            {condition && <button className="clear-section" type="button" onClick={() => setParam("condition", "")}>Clear product type</button>}
          </section>

          <section className="filter-group">
            <h3>Seller Type</h3>
            <label className="filter-check"><input type="radio" name="sellerType" checked={sellerType === "business_seller"} onChange={() => setParam("sellerType", "business_seller")} /> Business seller</label>
            <label className="filter-check"><input type="radio" name="sellerType" checked={sellerType === "individual_seller"} onChange={() => setParam("sellerType", "individual_seller")} /> Individual seller</label>
            {sellerType && <button className="clear-section" type="button" onClick={() => setParam("sellerType", "")}>Clear seller type</button>}
          </section>

          <section className="filter-group">
            <h3>Category</h3>
            <select value={category} onChange={(event) => setParam("category", event.target.value)}><option value="">All Categories</option>{PRODUCT_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          </section>

          <section className="filter-group">
            <h3>Price Range</h3>
            <form className="price-filter" onSubmit={applyPrice}><div><input type="number" min="0" placeholder="Min" value={priceInputs.minPrice} onChange={(event) => setPriceInputs((old) => ({ ...old, minPrice: event.target.value }))} /><span>to</span><input type="number" min="0" placeholder="Max" value={priceInputs.maxPrice} onChange={(event) => setPriceInputs((old) => ({ ...old, maxPrice: event.target.value }))} /></div><button type="submit">Apply</button></form>
          </section>

          <section className="filter-group">
            <h3>Listing Options</h3>
            <label className="filter-check"><input type="checkbox" checked={isSale} onChange={(event) => setParam("isSale", event.target.checked ? "true" : "")} /> On Sale</label>
            <label className="filter-check"><input type="checkbox" checked={freeShipping} onChange={(event) => setParam("freeShipping", event.target.checked ? "true" : "")} /> Free Shipping</label>
          </section>
        </aside>

        <section className="results-products">
          {error && <p className="error">{error}</p>}
          {loading && <p className="empty">Loading matching products...</p>}
          {!loading && !error && <ProductGrid products={products} viewMode={viewMode} empty="No matching products found." />}
        </section>
      </div>
    </main>
  );
}
