import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { useAuth } from "../context/AuthContext";
import { AuthLayout } from "../components/AuthLayout";
import { notifyError } from "../utils/notify";

export function LoginPage() {
  const { login, loading, error } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState(((location.state as { email?: string } | null)?.email) || "");
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

  // Errors (e.g. wrong password) appear as a pop-up; the form stays as it is
  const displayError = error || localError;
  useEffect(() => {
    if (displayError) notifyError(displayError);
  }, [displayError]);

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
          <div className="rlk-field__row">
            <label htmlFor="login-password">Password</label>
            <Link to="/forgot-password" state={{ email: email.trim() }} className="rlk-link">Forgot password?</Link>
          </div>
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
        <button type="submit" className="rlk-btn-gold" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p className="rlk-card__alt">Accounts are created by your administrator.</p>
      </form>
    </AuthLayout>
  );
}
