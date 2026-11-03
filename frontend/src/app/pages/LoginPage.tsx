import React, { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { AuthLayout } from "../components/AuthLayout";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, loading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError("");
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err: any) {
      // Error will be set in AuthContext and displayed, or we can set it locally if needed.
    }
  }

  const displayError = error || localError;

  return (
    <AuthLayout>
      <form className="rlk-card" onSubmit={submit} noValidate={false}>
        <div>
          <h2>Sign in</h2>
          <p className="rlk-card__sub">Enter your credentials to access your workspace.</p>
        </div>
        <div className="rlk-field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            placeholder="Enter your work email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <div className="rlk-field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        {displayError && <p className="rlk-error" role="alert">{displayError}</p>}
        <button type="submit" className="rlk-btn-gold" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p className="rlk-card__alt">
          New to RLKG PMS?{" "}
          <button type="button" className="rlk-link" onClick={() => navigate("/register")} disabled={loading}>
            Create an account
          </button>
        </p>
      </form>
    </AuthLayout>
  );
}
