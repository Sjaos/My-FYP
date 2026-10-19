import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function verifyEmail() {
    setMessage("");
    setError("");

    try {
      setSubmitting(true);
      const response = await api(
        "/api/auth/verify-email",
        {
          method: "POST",
          body: JSON.stringify({ token }),
        }
      );
      setMessage(response.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="narrow">
      <section>
        <h1>Verify your email</h1>
        {token && !message && (
          <p>
            Confirm your email below to finish creating your Selbuy account.
          </p>
        )}
        {!token && (
          <p className="error">
            This verification link is missing its token. Request a new email from the login page.
          </p>
        )}
        {message && <p className="notice">{message}</p>}
        {error && <p className="error">{error}</p>}
        {token && !message && (
          <button
            className="button block"
            type="button"
            onClick={verifyEmail}
            disabled={submitting}
          >
            {submitting ? "Verifying..." : "Verify email"}
          </button>
        )}
        <p>
          <Link to="/login">
            {message
              ? "Continue to login"
              : "Go to login"}
          </Link>
        </p>
      </section>
    </main>
  );
}
