import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
export default function Register() {
  const [form, setForm] = useState({
      name: "",
      email: "",
      password: "",
      role: "buyer",
      interests: [],
    }),
    [error, setError] = useState(""),
      [submitting, setSubmitting] = useState(false),
      nav = useNavigate();
  const options = ["Electronics", "Furniture", "Books", "Fashion", "Sports"];
  function field(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }
  function interest(x) {
    setForm({
      ...form,
      interests: form.interests.includes(x)
        ? form.interests.filter((i) => i !== x)
        : [...form.interests, x],
    });
  }
  async function submit(e) {
    e.preventDefault();
    setError("");

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    try {
      setSubmitting(true);
      const response = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(form),
      });
      nav("/check-email", {
        state: {
          message:
            response.message ||
            "We sent a verification link to your email. Click it to finish creating your account.",
          email: response.email || form.email,
          verificationPreviewUrl:
            response.verificationPreviewUrl,
          resendAvailableAt:
            response.resendAvailableAt,
          verificationEmailSent:
            response.verificationEmailSent,
        },
      });
    } catch (e) {
      if (e.message.includes("signup is already pending")) {
        nav("/check-email", {
          state: {
            email: form.email,
            message: e.message,
          },
        });
        return;
      }
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <main className="narrow">
      <form onSubmit={submit}>
        <h2>Create account</h2>
        {error && <p className="error">{error}</p>}
        <label>
          Full name
          <input name="name" value={form.name} onChange={field} required />
        </label>
        <label>
          Email
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={field}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            minLength="6"
            value={form.password}
            onChange={field}
            required
          />
        </label>
        <fieldset>
          <legend>Register as</legend>
          <label className="choice">
            <input
              type="radio"
              name="role"
              value="buyer"
              checked={form.role === "buyer"}
              onChange={field}
            />
            <span>
              <b>Buyer</b>
              <small>Browse, save and receive recommendations</small>
            </span>
          </label>
          <label className="choice">
            <input
              type="radio"
              name="role"
              value="business_seller"
              checked={form.role === "business_seller"}
              onChange={field}
            />
            <span>
              <b>Business Seller</b>
              <small>Sell new products with fixed prices and stock quantities</small>
            </span>
          </label>
          <label className="choice">
            <input
              type="radio"
              name="role"
              value="individual_seller"
              checked={form.role === "individual_seller"}
              onChange={field}
            />
            <span>
              <b>Individual Seller</b>
              <small>List your pre-owned items with condition and location details</small>
            </span>
          </label>
        </fieldset>
        {form.role === "buyer" && (
          <fieldset>
            <legend>Choose interests for cold-start recommendations</legend>
            <div className="chips">
              {options.map((x) => (
                <button
                  type="button"
                  className={
                    form.interests.includes(x) ? "chip selected" : "chip"
                  }
                  onClick={() => interest(x)}
                  key={x}
                >
                  {x}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <button className="button block" disabled={submitting}>
          {submitting ? "Sending verification email..." : `Register as ${form.role}`}
        </button>
        <p>
          Already registered? <Link to="/login">Login</Link>
        </p>
      </form>
    </main>
  );
}