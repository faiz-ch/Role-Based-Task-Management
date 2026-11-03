import React, { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { AuthLayout } from "../components/AuthLayout";

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, loading, error } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError("");
    if (!name.trim() || !email.trim() || !password) {
      setLocalError("All fields are required.");
      return;
    }
    try {
      await register(name.trim(), email.trim().toLowerCase(), password);
    } catch (err: any) {
      // Error is set in AuthContext
    }
  }

  const displayError = error || localError;

  return (
    <AuthLayout>
      <form className="rlk-card" onSubmit={submit}>
        <div>
          <h2>Create account</h2>
          <p className="rlk-card__sub">
            New accounts start with no role. An administrator assigns one before you can take actions.
          </p>
        </div>
        <div className="rlk-field">
          <label htmlFor="reg-name">Full name</label>
          <input
            id="reg-name"
            autoComplete="name"
            placeholder="Your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <div className="rlk-field">
          <label htmlFor="reg-email">Email</label>
          <input
            id="reg-email"
            type="email"
            autoComplete="email"
            placeholder="Enter your work email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <div className="rlk-field">
          <label htmlFor="reg-password">Password</label>
          <input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        {displayError && <p className="rlk-error" role="alert">{displayError}</p>}
        <button type="submit" className="rlk-btn-gold" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </button>
        <p className="rlk-card__alt">
          Already have an account?{" "}
          <button type="button" className="rlk-link" onClick={() => navigate("/login")} disabled={loading}>
            Sign in
          </button>
        </p>
      </form>
    </AuthLayout>
  );
}
