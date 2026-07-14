import React, { createContext, useContext, useState, useEffect } from "react";
import { UserType } from "../types";
import { login as apiLogin, register as apiRegister } from "../api/auth";
import { getMe, getMePermissions } from "../api/users";
import { registerLogoutCallback, clearTokens } from "../api/client";

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
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
