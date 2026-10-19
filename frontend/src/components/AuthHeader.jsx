import { Link } from "react-router-dom";

export default function AuthHeader() {
  return (
    <header className="auth-header">
      <div className="auth-header-inner">
        <Link className="auth-brand" to="/">
          <span className="auth-brand-mark">S</span>
          <span>Selbuy</span>
        </Link>
        <Link className="auth-back-link" to="/">
          Back to marketplace
        </Link>
      </div>
    </header>
  );
}