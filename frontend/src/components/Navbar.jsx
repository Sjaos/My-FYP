import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, currentUser } from "../api";
import { PRODUCT_CATEGORIES } from "../constants/categories";
import { getCart } from "../utils/cart";

export default function Navbar({ filters, setFilters }) {
  const user = currentUser();
  const navigate = useNavigate();
  const searchWrapRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [searchText, setSearchText] = useState(filters?.q || "");
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [cartCount, setCartCount] = useState(
    () => getCart().reduce((count, item) => count + item.quantity, 0)
  );

  useEffect(() => {
    const syncCartCount = () => {
      setCartCount(
        getCart().reduce((count, item) => count + item.quantity, 0)
      );
    };
    window.addEventListener("selbuy:cart-change", syncCartCount);
    window.addEventListener("storage", syncCartCount);
    return () => {
      window.removeEventListener("selbuy:cart-change", syncCartCount);
      window.removeEventListener("storage", syncCartCount);
    };
  }, []);

  useEffect(() => setSearchText(filters?.q || ""), [filters?.q]);

  useEffect(() => {
    function closeSuggestions(event) {
      if (!searchWrapRef.current?.contains(event.target)) {
        setSuggestionsOpen(false);
        setActiveSuggestion(-1);
      }
    }
    document.addEventListener("mousedown", closeSuggestions);
    return () => document.removeEventListener("mousedown", closeSuggestions);
  }, []);

  useEffect(() => {
    const value = searchText.trim();
    if (value.length < 2) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      setSuggestionsLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setSuggestionsLoading(true);
        const products = await api(`/api/products?q=${encodeURIComponent(value)}&sort=newest`);
        if (cancelled) return;

        const normalized = value.toLowerCase();
        const titleSuggestions = (products || [])
          .map((product) => String(product.title || "").trim())
          .filter(Boolean)
          .filter((title, index, all) =>
            title.toLowerCase().includes(normalized) &&
            all.findIndex((candidate) => candidate.toLowerCase() === title.toLowerCase()) === index
          )
          .slice(0, 8)
          .map((title) => ({
            type: "search",
            id: title,
            label: title,
            value: title,
          }));

        setSuggestions(titleSuggestions);
        setSuggestionsOpen(true);
        setActiveSuggestion(-1);
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setSuggestionsOpen(false);
        }
      } finally {
        if (!cancelled) setSuggestionsLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchText]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("afterLogin");
    navigate("/");
    window.location.reload();
  }

  function openSearch(value) {
    const cleanValue = value.trim();
    setSuggestionsOpen(false);
    setActiveSuggestion(-1);
    setFilters?.((previous) => ({ ...previous, q: cleanValue }));
    navigate(cleanValue ? `/search?q=${encodeURIComponent(cleanValue)}` : "/search");
  }

  function submitSearch(event) {
    event.preventDefault();
    openSearch(searchText);
  }

  function chooseSuggestion(item) {
    setSearchText(item.value);
    setSuggestionsOpen(false);
    navigate(`/search?q=${encodeURIComponent(item.value)}`);
  }

  function handleSearchKeyDown(event) {
    if (!suggestionsOpen || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestion((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestion((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === "Enter" && activeSuggestion >= 0) {
      event.preventDefault();
      chooseSuggestion(suggestions[activeSuggestion]);
    } else if (event.key === "Escape") {
      setSuggestionsOpen(false);
      setActiveSuggestion(-1);
    }
  }

  function chooseCategory(category) {
    setCategoryOpen(false);
    setMenuOpen(false);
    navigate(category ? `/search?category=${encodeURIComponent(category)}` : "/search");
  }

  return (
    <header className="site-header">
      <div className="header-main shell">
        <button className="mobile-trigger" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open menu">☰</button>
        <Link className="brand" to="/"><span className="brand-mark">S</span><span>Selbuy</span></Link>
        <div className="search-wrap" ref={searchWrapRef}>
          <form className="main-search" onSubmit={submitSearch}>
            <span>⌕</span>
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onFocus={() => searchText.trim().length >= 2 && setSuggestionsOpen(true)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search products and categories"
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={suggestionsOpen}
            />
            <button type="submit">Search</button>
          </form>
          {suggestionsOpen && (
            <div className="search-suggestions" role="listbox">
              {suggestionsLoading && <div className="suggestion-status">Searching...</div>}
              {!suggestionsLoading && suggestions.length === 0 && <div className="suggestion-status">No suggestions found</div>}
              {!suggestionsLoading && suggestions.map((item, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={activeSuggestion === index}
                  className={activeSuggestion === index ? "search-suggestion active" : "search-suggestion"}
                  key={`${item.type}-${item.id}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseSuggestion(item)}
                >
                  <span className="suggestion-icon">⌕</span>
                  <span><strong>{item.label}</strong></span>
                </button>
              ))}
              {!suggestionsLoading && suggestions.length > 0 && (
                <button type="button" className="view-all-suggestions" onMouseDown={(event) => event.preventDefault()} onClick={() => openSearch(searchText)}>
                  View all results for “{searchText.trim()}”
                </button>
              )}
            </div>
          )}
        </div>
        <div className="header-actions">
          <Link to="/cart" className="header-action">
            <b>🛒</b>
            <span>Cart{cartCount > 0 ? ` (${cartCount})` : ""}</span>
          </Link>
          {user?.role === "buyer" && <Link to="/orders" className="header-action"><b>▤</b><span>My Orders</span></Link>}
          {user?.role === "buyer" && <Link to="/saved" className="header-action"><b>♡</b><span>Wishlist</span></Link>}
          {user?.role === "buyer" && <span className="action-divider" />}
          {!user ? <Link to="/login" className="account-link"><span className="avatar">G</span><span><small>Welcome</small><strong>Login / Register</strong></span></Link> : <div className="account-wrap"><button type="button" className="account-link"><span className="avatar">{user.name?.[0] || "U"}</span><span><small>Welcome</small><strong>{user.name?.split(" ")[0]}⌄</strong></span></button><div className="account-dropdown">{user.role === "buyer" && <><Link to="/orders">My Orders</Link><Link to="/recommendations">For You</Link><Link to="/saved">Saved Products</Link></>}{user.role !== "buyer" && <><Link to="/my-listings">{user.role === "business_seller" ? "Business Dashboard" : "Seller Dashboard"}</Link><Link to="/seller/orders">Customer Orders</Link><Link to="/sell">Add Product</Link></>}<button type="button" onClick={logout}>Logout</button></div></div>}
        </div>
      </div>
      <div className={menuOpen ? "header-nav open" : "header-nav"}>
        <div className="shell nav-inner">
          <div className="category-nav"><button type="button" onClick={() => setCategoryOpen(!categoryOpen)}><span>☰</span> Categories <b>⌄</b></button>{categoryOpen && <div className="category-dropdown"><button type="button" onClick={() => chooseCategory("")}>All Categories<span>›</span></button>{PRODUCT_CATEGORIES.map((category) => <button type="button" key={category} onClick={() => chooseCategory(category)}>{category}<span>›</span></button>)}</div>}</div>
          <nav><button className="nav-text-button" type="button" onClick={() => navigate("/search?condition=New")}>New Products</button><button className="nav-text-button" type="button" onClick={() => navigate("/search?condition=Used")}>Used Products</button><button className="nav-text-button" type="button" onClick={() => navigate("/search?isSale=true")}>Deals</button></nav>
          {user && user.role !== "buyer" ? <Link className="sell-link" to="/my-listings">Seller Dashboard →</Link> : <Link className="sell-link" to="/register">Sell on Selbuy →</Link>}
        </div>
      </div>
    </header>
  );
}
