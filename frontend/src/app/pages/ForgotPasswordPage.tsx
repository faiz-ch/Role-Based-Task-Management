import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { requestResetCode, resetPasswordWithCode } from "../api/auth";
import { notifyError, notifySuccess } from "../utils/notify";

/**
 * Forgot password:
 *   1. enter email  → a 6-digit code is emailed (same message whether or not the email exists)
 *   2. enter the code + new password on one screen → password changed, signed out elsewhere
 */
const RESEND_SECONDS = 60;

export function ForgotPasswordPage() {
  const location = useLocation();
  const [stage, setStage] = useState<"email" | "code" | "done">("email");
  const [email, setEmail] = useState(((location.state as { email?: string } | null)?.email) || "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean) return notifyError("Please enter your email.");
    setBusy(true);
    try {
      const msg = await requestResetCode(clean);
      notifySuccess(msg);
      setEmail(clean);
      setStage("code");
      setWait(RESEND_SECONDS);
    } catch (err: any) {
      notifyError(err?.message || "Could not send the code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return notifyError("Enter the 6-digit code from the email.");
    if (password.length < 8) return notifyError("The new password must be at least 8 characters.");
    if (password !== confirm) return notifyError("The two passwords do not match.");
    setBusy(true);
    try {
      const msg = await resetPasswordWithCode(email, code, password);
      notifySuccess(msg);
      setStage("done");
    } catch (err: any) {
      notifyError(err?.message || "Could not change the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      {stage === "email" && (
        <form className="rlk-card" onSubmit={sendCode} data-testid="forgot-email">
          <div>
            <h2>Forgot password</h2>
            <p className="rlk-card__sub">Enter your work email. We'll send you a 6-digit code.</p>
          </div>
          <div className="rlk-field">
            <label htmlFor="fp-email">Email</label>
            <input id="fp-email" type="email" autoComplete="username" placeholder="Enter your work email"
              value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} autoFocus />
          </div>
          <button type="submit" className="rlk-btn-gold" disabled={busy}>{busy ? "Sending…" : "Send code"}</button>
          <p className="rlk-card__alt"><Link to="/login" className="rlk-link">Back to sign in</Link></p>
        </form>
      )}

      {stage === "code" && (
        <form className="rlk-card" onSubmit={reset} data-testid="forgot-code">
          <div>
            <h2>Choose a new password</h2>
            <p className="rlk-card__sub">
              If <b>{email}</b> is registered, a 6-digit code is on its way. It expires in 10 minutes.
              Check the spam folder too.
            </p>
          </div>
          <div className="rlk-field">
            <label htmlFor="fp-code">6-digit code</label>
            <input id="fp-code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={6}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required disabled={busy} autoFocus
              className="rlk-codeinput" />
          </div>
          <div className="rlk-field">
            <label htmlFor="fp-new">New password</label>
            <input id="fp-new" type="password" autoComplete="new-password" placeholder="At least 8 characters"
              value={password} onChange={(e) => setPassword(e.target.value)} required disabled={busy} />
          </div>
          <div className="rlk-field">
            <label htmlFor="fp-confirm">Confirm new password</label>
            <input id="fp-confirm" type="password" autoComplete="new-password" placeholder="Type it again"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} required disabled={busy} />
          </div>
          <button type="submit" className="rlk-btn-gold" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
          <p className="rlk-card__alt">
            {wait > 0 ? <>Didn't get it? You can ask again in {wait}s</> : (
              <button type="button" className="rlk-link" onClick={() => sendCode()} disabled={busy}>Send a new code</button>
            )}
            {" · "}
            <button type="button" className="rlk-link" onClick={() => { setStage("email"); setCode(""); }}>Use a different email</button>
          </p>
        </form>
      )}

      {stage === "done" && (
        <div className="rlk-card" data-testid="forgot-done">
          <div>
            <h2>Password changed</h2>
            <p className="rlk-card__sub">You can now sign in with your new password. You have been signed out on other devices.</p>
          </div>
          <Link to="/login" state={{ email }} className="rlk-btn-gold" style={{ textAlign: "center", textDecoration: "none" }}>Sign in</Link>
        </div>
      )}
    </AuthLayout>
  );
}
