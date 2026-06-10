import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';

import { useAuthStore, type JwtPayload } from '../store/authStore';

// ARCH-DECISION: All mobile traffic is routed through the single nginx api-gateway.
// Direct service ports are used ONLY in development (direct Docker network access).
//
// The gateway URL is set via EXPO_PUBLIC_API_BASE_URL (read at build time by Expo).
// Default is the Android emulator loopback alias (10.0.2.2 → host localhost).
// In production, set EXPO_PUBLIC_API_BASE_URL=https://api.normeshaccp.com
//
// ARCH-DECISION: We declare `process` narrowly here instead of installing
// @types/node. Metro/Expo injects EXPO_PUBLIC_* variables via its own
// environment plugin — we only need the shape, not the full Node.js `process`.
declare const process: { env: Record<string, string | undefined> };

// ARCH-DECISION: Default to the production HTTPS URL (not the Android emulator
// loopback 10.0.2.2 which only works in dev). Development builds set
// EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:80 via eas.json or .env.local.
// Production builds set EXPO_PUBLIC_API_BASE_URL=https://178.105.126.165 (or
// https://api.normes-haccp.com once the domain is configured).
const GATEWAY_BASE =
  process.env['EXPO_PUBLIC_API_BASE_URL'] ?? 'https://178.105.126.165';

// ── Authenticated gateway client ────────────────────────────────────────────
// Use this for all API calls — all services are routed through nginx.

export const apiClient = axios.create({
  baseURL: GATEWAY_BASE,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().token;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Silent token refresh on 401 ──────────────────────────────────────────────
// ARCH-DECISION: The access token is short-lived (15 min). Rather than kicking
// the operator back to the login screen on every expiry, we transparently
// exchange the stored refresh token for a fresh access token and replay the
// failed request once. The auth-service ROTATES the refresh token on every
// /auth/refresh call (the old one is invalidated, with replay detection), so we
// must persist the NEW refresh token returned in the response.

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  user: JwtPayload;
}

// Endpoints that must never trigger the refresh-and-retry loop (they ARE the
// auth flow). Matching on the path suffix keeps this independent of the
// /api/v1 prefix and the gateway host.
function isAuthRoute(url: string | undefined): boolean {
  if (!url) return false;
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/refresh') ||
    url.includes('/auth/logout')
  );
}

// ARCH-DECISION: Single-flight refresh. When several requests fail with 401 at
// once (e.g. the AgendaScreen fires three parallel calls), they must share ONE
// refresh round-trip — otherwise each would rotate the refresh token and
// invalidate the others, tripping the server's replay protection and logging
// the user out. `refreshPromise` is the shared in-flight refresh, if any.
let refreshPromise: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  const currentRefreshToken = useAuthStore.getState().refreshToken;
  if (!currentRefreshToken) return null;
  try {
    // Use a bare axios call (not apiClient/authClient) so this request is never
    // itself intercepted, avoiding any recursion.
    const res = await axios.post<RefreshResponse>(
      `${GATEWAY_BASE}/api/v1/auth/refresh`,
      { refreshToken: currentRefreshToken },
      { timeout: 10_000, headers: { 'Content-Type': 'application/json' } },
    );
    const { accessToken, refreshToken, user } = res.data;
    useAuthStore.getState().setAuth(accessToken, user, refreshToken);
    return accessToken;
  } catch {
    return null;
  }
}

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;
    const status = error.response?.status;

    if (status !== 401 || !original || original._retry || isAuthRoute(original.url)) {
      return Promise.reject(error);
    }

    original._retry = true;
    const newToken = await refreshAccessToken();
    if (!newToken) {
      // Refresh failed (expired/revoked refresh token) — clear local session so
      // the navigator redirects to the login screen.
      await useAuthStore.getState().logout();
      return Promise.reject(error);
    }

    original.headers = original.headers ?? {};
    original.headers.Authorization = `Bearer ${newToken}`;
    return apiClient(original);
  },
);

// ── Unauthenticated client (login, public endpoints) ────────────────────────

export const authClient = axios.create({
  baseURL: GATEWAY_BASE,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Named convenience aliases (backward-compat — all point to gateway) ──────
// ARCH-DECISION: Kept for backward-compat with existing screens that import
// controlClient, nonconformityClient, etc. All are now aliases for apiClient
// so a single gateway URL change covers the entire app.

export const controlClient       = apiClient;
export const nonconformityClient = apiClient;
export const dlcClient           = apiClient;
export const tenantClient        = apiClient;
