import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resendMessage, setResendMessage] = useState("");
  const [resendError, setResendError] = useState("");
  const [resendPreviewUrl, setResendPreviewUrl] =
    useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      setSubmitting(true);
      const response = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("token", response.token);
      localStorage.setItem("user", JSON.stringify(response.user));
      const requestedPage = sessionStorage.getItem("afterLogin");
      sessionStorage.removeItem("afterLogin");
      const defaultPage = response.user?.role !== "buyer" ? "/my-listings" : "/";
      navigate(requestedPage || defaultPage, { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function resendVerification() {
    setResendMessage("");
    setResendError("");
    setResendPreviewUrl("");

    if (!email.trim()) {
      setResendError(
        "Enter your email address above first."
      );
      return;
    }

    try {
      setResending(true);
      const response = await api(
        "/api/auth/resend-verification",
        {
          method: "POST",
          body: JSON.stringify({ email }),
        }
      );
      setResendMessage(response.message);
      setResendPreviewUrl(
        response.verificationPreviewUrl || ""
      );
    } catch (requestError) {
      setResendError(requestError.message);
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="narrow">
      <form onSubmit={submit}>
        <h2>Login</h2>
        {location.state?.message && <p className="notice">{location.state.message}</p>}
        {location.state?.verificationPreviewUrl && (
          <p>
            <a href={location.state.verificationPreviewUrl}>
              Open local verification preview
            </a>
          </p>
        )}
        {error && <p className="error">{error}</p>}
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <button className="button block" disabled={submitting}>{submitting ? "Logging in..." : "Login"}</button>
        {error.includes("verify your email") && (
          <button
            className="button block"
            type="button"
            onClick={resendVerification}
            disabled={resending}
          >
            {resending
              ? "Sending..."
              : "Resend verification email"}
          </button>
        )}
        {resendMessage && (
          <p className="notice">{resendMessage}</p>
        )}
        {resendPreviewUrl && (
          <p>
            <a href={resendPreviewUrl}>
              Open local verification preview
            </a>
          </p>
        )}
        {resendError && (
          <p className="error">{resendError}</p>
        )}
        <p>New user? <Link to="/register">Register</Link></p>
      </form>
    </main>
  );
}
