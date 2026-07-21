import React, { useState } from "react";
import { useNavigate } from "react-router";
import { CheckSquare } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { FldInput } from "../components/FldInput";

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
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-7 h-7 bg-[#0C1022] rounded-lg flex items-center justify-center">
            <CheckSquare size={14} className="text-white" />
          </div>
          <span className="font-semibold tracking-tight">Nexus Tasks</span>
        </div>

        <h2 className="text-2xl font-bold text-foreground mb-1">Create account</h2>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          New accounts start with no role. An admin must assign one before you can perform actions.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <FldInput
            label="Full name"
            placeholder="Jane Smith"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={loading}
          />
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
            placeholder="Choose a password"
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
            className="w-full py-2.5 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-5">
          Already have an account?{" "}
          <button
            onClick={() => navigate("/login")}
            disabled={loading}
            className="text-blue-600 hover:underline font-medium cursor-pointer"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
