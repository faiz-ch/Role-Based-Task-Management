import React, { useState } from "react";
import { useNavigate } from "react-router";
import { CheckSquare } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { FldInput } from "../components/FldInput";

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
    <div className="min-h-screen bg-background flex">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between w-[440px] bg-[#0C1022] p-12 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2.5 mb-14">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <CheckSquare size={15} className="text-white" />
            </div>
            <span className="text-white font-semibold text-lg tracking-tight">Nexus Tasks</span>
          </div>
          <h1 className="text-white text-3xl font-bold leading-tight mb-3">
            Manage work.<br />Ship faster.
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            Role-based task management for engineering teams. Every permission, every task, every status — in one place.
          </p>
        </div>
        <div className="space-y-0 divide-y divide-white/10">
          {[
            { label: "Active tasks", value: "Real-time" },
            { label: "Team members", value: "Role-based" },
            { label: "Roles defined", value: "Dynamic" },
          ].map((s) => (
            <div key={s.label} className="flex justify-between items-center py-3">
              <span className="text-slate-500 text-sm">{s.label}</span>
              <span className="text-white font-mono text-xs font-semibold tabular-nums">{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-7 h-7 bg-[#0C1022] rounded-lg flex items-center justify-center">
              <CheckSquare size={14} className="text-white" />
            </div>
            <span className="font-semibold tracking-tight">Nexus Tasks</span>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-1">Sign in</h2>
          <p className="text-muted-foreground text-sm mb-8">Enter your credentials to access your workspace.</p>

          <form onSubmit={submit} className="space-y-4">
            <FldInput
              label="Email"
              type="email"
              placeholder="you@nexus.io"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
            <FldInput
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
            {displayError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {displayError}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors mt-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-5">
            New to Nexus?{" "}
            <button
              onClick={() => navigate("/register")}
              disabled={loading}
              className="text-blue-600 hover:underline font-medium cursor-pointer"
            >
              Create an account
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
