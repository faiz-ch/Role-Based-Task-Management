// Set VITE_API_BASE_URL in your deployment platform's env vars (e.g. Vercel).
// Falls back to localhost for local dev.
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

let accessToken: string | null = null;
let refreshToken: string | null = null;
let logoutCallback: (() => void) | null = null;
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem(ACCESS_TOKEN_KEY, access);
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getAccessToken() {
  return accessToken;
}

export function getRefreshToken() {
  return refreshToken;
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function initializeTokensFromStorage() {
  const access = localStorage.getItem(ACCESS_TOKEN_KEY);
  const refresh = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (access && refresh) {
    accessToken = access;
    refreshToken = refresh;
  }
}

export function registerLogoutCallback(cb: () => void) {
  logoutCallback = cb;
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, data: any) {
    const detail = data?.detail;
    let message: string;

    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail)) {
      // FastAPI validation errors: array of objects with .msg field
      message = detail
        .map((item: any) => item?.msg || "")
        .filter((msg: string) => msg)
        .join("; ");
    } else if (detail && typeof detail === "object" && detail.msg) {
      // Single object with .msg field
      message = detail.msg;
    } else {
      message = `API request failed with status ${status}`;
    }

    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  
  const headers = new Headers(options.headers || {});
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers,
  };

  const response = await fetch(url, fetchOptions);

  if (response.status === 401 && refreshToken && !path.includes("/auth/refresh") && !path.includes("/auth/login")) {
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        addRefreshSubscriber((token) => {
          headers.set("Authorization", `Bearer ${token}`);
          fetch(url, fetchOptions)
            .then(async (res) => {
              if (!res.ok) {
                const text = await res.text();
                const errData = text ? JSON.parse(text) : null;
                reject(new ApiError(res.status, errData));
              } else {
                const text = await res.text();
                resolve(text ? JSON.parse(text) : null);
              }
            })
            .catch(reject);
        });
      });
    }

    isRefreshing = true;

    try {
      const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!refreshRes.ok) {
        throw new Error("Refresh token expired or invalid");
      }

      const tokenData = await refreshRes.json();
      setTokens(tokenData.access_token, tokenData.refresh_token);
      isRefreshing = false;
      
      onRefreshed(tokenData.access_token);

      // Retry the original request
      headers.set("Authorization", `Bearer ${tokenData.access_token}`);
      const retryResponse = await fetch(url, fetchOptions);
      if (!retryResponse.ok) {
        const text = await retryResponse.text();
        const errData = text ? JSON.parse(text) : null;
        throw new ApiError(retryResponse.status, errData);
      }
      const retryText = await retryResponse.text();
      return retryText ? JSON.parse(retryText) : null;
    } catch (err) {
      isRefreshing = false;
      clearTokens();
      if (logoutCallback) {
        logoutCallback();
      }
      throw err;
    }
  }

  if (!response.ok) {
    const text = await response.text();
    let errData;
    try {
      errData = text ? JSON.parse(text) : null;
    } catch {
      errData = { detail: text || "Unknown error" };
    }
    throw new ApiError(response.status, errData);
  }

  if (response.status === 204) {
    return null;
  }

  const responseText = await response.text();
  return responseText ? JSON.parse(responseText) : null;
}
