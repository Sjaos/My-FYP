import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../api";

export default function CheckEmail() {
  const { state } = useLocation();
  const email = state?.email || "";
  const [message, setMessage] = useState(
    state?.message ||
      "Check your inbox and click the verification link to finish creating your account."
  );
  const [previewUrl, setPreviewUrl] = useState(
    state?.verificationPreviewUrl || ""
  );
  const [resendAvailableAt, setResendAvailableAt] =
    useState(state?.resendAvailableAt || "");
  const [secondsRemaining, setSecondsRemaining] =
    useState(0);
  const [error, setError] = useState("");
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!resendAvailableAt) {
      setSecondsRemaining(0);
      return undefined;
    }

    function updateCountdown() {
      setSecondsRemaining(
        Math.max(
          0,
          Math.ceil(
            (Date.parse(resendAvailableAt) - Date.now()) /
              1000
          )
        )
      );
    }

    updateCountdown();
    const interval = window.setInterval(
      updateCountdown,
      1000
    );

    return () => window.clearInterval(interval);
  }, [resendAvailableAt]);

  async function resendVerification() {
    setError("");

    if (!email) {
      setError(
        "Return to registration and enter your email address to request a verification link."
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
      setMessage(response.message);
      if (response.verificationPreviewUrl) {
        setPreviewUrl(response.verificationPreviewUrl);
      }
      setResendAvailableAt(
        response.resendAvailableAt || ""
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="narrow">
      <section>
        <h1>Check your email</h1>
        {email && (
          <p>
            {previewUrl
              ? "A local verification link is ready for "
              : state?.verificationEmailSent === true
                ? "We sent a verification link to "
                : state?.verificationEmailSent === false
                  ? "We could not send the verification link to "
                  : "Check the inbox for "}
            <strong>{email}</strong>.
          </p>
        )}
        <p>{message}</p>
        <p>
          Click the link in that email to verify your address and finish
          creating your Selbuy account. If you do not see it, check your
          spam or junk folder.
        </p>
        {previewUrl && (
          <p>
            <a href={previewUrl}>Open local verification preview</a>
          </p>
        )}
        {error && <p className="error">{error}</p>}
        <button
          className="button block"
          type="button"
          onClick={resendVerification}
          disabled={
            resending || secondsRemaining > 0
          }
        >
          {resending
            ? "Sending..."
            : secondsRemaining > 0
              ? `Resend link in ${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, "0")}`
              : "Resend verification link"}
        </button>
        {secondsRemaining > 0 && (
          <p className="muted" aria-live="polite">
            You can request another link in{" "}
            {secondsRemaining} second
            {secondsRemaining === 1 ? "" : "s"}.
          </p>
        )}
        <p>
          Already verified? <Link to="/login">Go to login</Link>
        </p>
      </section>
    </main>
  );
}
