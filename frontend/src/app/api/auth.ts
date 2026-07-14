import { apiFetch, setTokens } from "./client";

export async function login(email: string, password: string) {
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setTokens(data.access_token, data.refresh_token);
  return data;
}

export async function register(name: string, email: string, password: string) {
  return apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}
