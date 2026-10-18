import React, { createContext, useContext, useState, useEffect } from "react";
import { UserType } from "../types";
import { login as apiLogin, register as apiRegister } from "../api/auth";
import { getMe, getMePermissions } from "../api/users";
import { queryClient } from "../api/queryClient";
import { registerLogoutCallback, clearTokens, initializeTokensFromStorage, getStoredRefreshToken, getAccessToken, setTokens, API_BASE_URL } from "../api/client";

interface AuthContextType {
  currentUser: UserType | null;
  permissions: string[];
  loading: boolean;
  /** false while the app is still restoring the session after a page refresh (F5) */
  initialized: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Reads the expiry time ("exp") written inside a JWT access token and returns
 * true if the token is still valid for at least 30 more seconds.
 * Used on page refresh so we only ask the server for a new token when needed.
 */
function isTokenStillValid(token: string | null): boolean {
  if (!token) return false;
  try {
    const middlePart = token.split(".")[1];
    const json = atob(middlePart.replace(/-/g, "+").replace(/_/g, "/"));
    const data = JSON.parse(json);
    return typeof data.exp === "number" && data.exp * 1000 > Date.now() + 30_000;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true); // Start as true for initial session restoration
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState<boolean>(false);

  const logout = React.useCallback(() => {
    clearTokens();
    queryClient.clear(); // forget all cached data, so the next user never sees it
    setCurrentUser(null);
    setPermissions([]);
    setError(null);
  }, []);

  // Register logout callback for client.ts when it gets a refresh failure
  useEffect(() => {
    registerLogoutCallback(logout);
  }, [logout]);

  // On page load / refresh (F5): restore the session.
  // Only asks the server for a new token if the saved one has expired.
  useEffect(() => {
    async function restoreSession() {
      try {
        initializeTokensFromStorage();
        const storedRefreshToken = getStoredRefreshToken();
        if (!storedRefreshToken) {
          return; // never logged in -> nothing to restore
        }

        if (!isTokenStillValid(getAccessToken())) {
          const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ refresh_token: storedRefreshToken }),
          });
          if (!refreshRes.ok) {
            // Refresh token expired or invalid -> stay logged out
            clearTokens();
            return;
          }
          const tokenData = await refreshRes.json();
          setTokens(tokenData.access_token, tokenData.refresh_token);
        }

        // Fetch user and permissions
        const [user, perms] = await Promise.all([getMe(), getMePermissions()]);
        setCurrentUser(user);
        setPermissions(perms);
      } catch (err) {
        // Session restoration failed, clear tokens and stay logged out
        clearTokens();
      } finally {
        setLoading(false);
        setInitialized(true); // the page guards wait for this before deciding anything
      }
    }

    restoreSession();
  }, []);

  async function login(email: string, password: string) {
    setLoading(true);
    setError(null);
    try {
      // 1. Call real login endpoint
      await apiLogin(email, password);
      queryClient.clear(); // start with an empty store for this user
      
      // 2. Fetch profile and permissions
      const [user, perms] = await Promise.all([getMe(), getMePermissions()]);
      
      setCurrentUser(user);
      setPermissions(perms);
    } catch (err: any) {
      setError(err?.message || "Login failed. Please check your credentials.");
      logout();
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function register(name: string, email: string, password: string) {
    setLoading(true);
    setError(null);
    try {
      // 1. Call real register endpoint
      await apiRegister(name, email, password);
      
      // 2. Automatically log them in
      await login(email, password);
    } catch (err: any) {
      setError(err?.message || "Registration failed.");
      throw err;
    } finally {
      setLoading(false);
    }
  }

  function clearError() {
    setError(null);
  }

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        permissions,
        loading,
        initialized,
        error,
        login,
        register,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
