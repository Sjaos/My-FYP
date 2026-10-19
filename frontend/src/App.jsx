import { useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import AuthHeader from "./components/AuthHeader";
import RoleRoute from "./components/RoleRoute";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ProductDetail from "./pages/ProductDetail";
import AddProduct from "./pages/AddProduct";
import EditProduct from "./pages/EditProduct";
import MyListings from "./pages/MyListings";
import SavedItems from "./pages/SavedItems";
import Recommendations from "./pages/Recommendations";
import Checkout from "./pages/Checkout";
import Orders from "./pages/Orders";
import Cart from "./pages/Cart";
import NotFound from "./pages/NotFound";
import SearchResults from "./pages/SearchResults";
import VerifyEmail from "./pages/VerifyEmail";
import CheckEmail from "./pages/CheckEmail";

export default function App() {
  const location = useLocation();
  const isAuthPage = [
    "/login",
    "/register",
    "/check-email",
    "/verify-email",
  ].includes(location.pathname);
  const [filters, setFilters] = useState({
    q: "",
    category: "",
    condition: "",
    minPrice: "",
    maxPrice: "",
    isSale: false,
    freeShipping: false,
    sort: "newest",
    viewMode: "gallery",
  });

  return (
    <div className={isAuthPage ? "auth-layout" : "site-layout"}>
      {isAuthPage ? <AuthHeader /> : <Navbar filters={filters} setFilters={setFilters} />}
      <Routes>
        <Route path="/" element={<Home filters={filters} setFilters={setFilters} />} />
        <Route path="/search" element={<SearchResults />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/check-email" element={<CheckEmail />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<RoleRoute role="buyer"><Checkout /></RoleRoute>} />
        <Route path="/checkout/:productId" element={<RoleRoute role="buyer"><Checkout /></RoleRoute>} />
        <Route path="/orders" element={<RoleRoute role="buyer"><Orders /></RoleRoute>} />
        <Route path="/seller/orders" element={<RoleRoute role={["business_seller", "individual_seller"]}><Orders sellerView /></RoleRoute>} />
        <Route path="/sell" element={<RoleRoute role={["business_seller", "individual_seller"]}><AddProduct /></RoleRoute>} />
        <Route path="/products/:id/edit" element={<RoleRoute role={["business_seller", "individual_seller"]}><EditProduct /></RoleRoute>} />
        <Route path="/my-listings" element={<RoleRoute role={["business_seller", "individual_seller"]}><MyListings /></RoleRoute>} />
        <Route path="/saved" element={<RoleRoute role="buyer"><SavedItems /></RoleRoute>} />
        <Route path="/recommendations" element={<RoleRoute role="buyer"><Recommendations /></RoleRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {!isAuthPage && <Footer />}
    </div>
  );
}
