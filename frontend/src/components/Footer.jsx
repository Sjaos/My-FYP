import { Link } from "react-router-dom";
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div><Link className="footer-brand" to="/"><span>S</span> Selbuy</Link><p>AI-driven marketplace for new products and pre-owned deals.</p></div>
        <div><h4>Shop</h4><a href="/#new-products">New Products</a><a href="/#used-products">Used Products</a><a href="/#top-picks">Top Picks</a></div>
        <div><h4>Marketplace</h4><Link to="/login">Login</Link><Link to="/register">Create Account</Link><a href="/#products">Browse Products</a></div>
        <div><h4>Sell with us</h4><Link to="/register">Create Seller Account</Link><Link to="/sell">List a Product</Link><Link to="/my-listings">Manage Listings</Link></div>
        <div><h4>Project</h4><p>Semester 7 core marketplace and recommendation system.</p></div>
      </div>
      <div className="footer-bottom shell"><span>© 2026 Selbuy. All rights reserved.</span><span>Academic FYP Project</span></div>
    </footer>
  );
}
