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

/** Forgot password, step 1: email a 6-digit code (the reply is the same whether or not the email is registered). */
export async function requestResetCode(email: string): Promise<string> {
  const data = await apiFetch("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
  return data?.message ?? "If that email is registered, a 6-digit code has been sent to it.";
}

/** Forgot password, step 2: the code and the new password together. */
export async function resetPasswordWithCode(email: string, code: string, newPassword: string): Promise<string> {
  const data = await apiFetch("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ email, code, new_password: newPassword }),
  });
  return data?.message ?? "Your password has been changed.";
}
