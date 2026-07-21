import React, { createContext, useContext, useState, useEffect } from "react";
import { UserType } from "../types";
import { login as apiLogin, register as apiRegister } from "../api/auth";
import { getMe, getMePermissions } from "../api/users";
import { registerLogoutCallback, clearTokens, initializeTokensFromStorage, getStoredRefreshToken, setTokens, API_BASE_URL } from "../api/client";

interface AuthContextType {
  currentUser: UserType | null;
  permissions: string[];
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true); // Start as true for initial session restoration
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState<boolean>(false);

  const logout = React.useCallback(() => {
    clearTokens();
    setCurrentUser(null);
    setPermissions([]);
    setError(null);
  }, []);

  // Register logout callback for client.ts when it gets a refresh failure
  useEffect(() => {
    registerLogoutCallback(logout);
  }, [logout]);

  // Initialize tokens from storage and attempt silent refresh on mount
  useEffect(() => {
    async function restoreSession() {
      try {
        initializeTokensFromStorage();
        const storedRefreshToken = getStoredRefreshToken();
        
        if (storedRefreshToken) {
          // Attempt silent token refresh
          const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ refresh_token: storedRefreshToken }),
          });

          if (refreshRes.ok) {
            const tokenData = await refreshRes.json();
            setTokens(tokenData.access_token, tokenData.refresh_token);
            
            // Fetch user and permissions
            const [user, perms] = await Promise.all([getMe(), getMePermissions()]);
            setCurrentUser(user);
            setPermissions(perms);
          } else {
            // Refresh failed, clear tokens and stay logged out
            clearTokens();
          }
        }
      } catch (err) {
        // Session restoration failed, clear tokens and stay logged out
        clearTokens();
      } finally {
        setLoading(false);
        setInitialized(true);
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
