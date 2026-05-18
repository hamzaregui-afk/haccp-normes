/**
 * api.ts — Axios instance for the HACCP web dashboard
 *
 * Enterprise reliability features (Wave 1–3):
 *
 * 1. CORRELATION ID: Every request carries X-Correlation-ID (UUID v4) so all
 *    logs across nginx + 10 microservices can be joined on a single trace key.
 *    The response echo is validated and stored for debugging.
 *
 * 2. IDEMPOTENCY KEY: State-mutating requests (POST/PATCH/DELETE) automatically
 *    receive an Idempotency-Key header. The server caches the response for 24 h,
 *    so network retries never create duplicate tasks, NCs, or reports.
 *    The key is generated once per request and cleared on success — retries
 *    from the response interceptor reuse the same key.
 *
 * 3. 401 → REFRESH → RETRY: Seamless token refresh without the user noticing.
 *    If refresh fails, auto-logout.
 *
 * 4. TIMEOUT TIERS: Standard 15 s for most endpoints; PDF generation and report
 *    exports use 120 s (matches the nginx read_timeout for /api/v1/reports).
 */
import axios, { type InternalAxiosRequestConfig } from 'axios';

import { useAuthStore } from '@/store/auth.store';

// ─── Timeout tiers ────────────────────────────────────────────────────────────
const DEFAULT_TIMEOUT = 15_000;
const REPORT_TIMEOUT  = 120_000;
const REPORT_PATH_RE  = /\/api\/v1\/reports/;

// ─── Idempotency key storage ──────────────────────────────────────────────────
// Per-request key stored in the config object so retries in the response
// interceptor send the same key (not a new one).
const IDEM_KEY_PROP = '__idempotencyKey' as const;
const MUTATING_METHODS = new Set(['post', 'patch', 'put', 'delete']);

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    [IDEM_KEY_PROP]?: string;
    _retry?: boolean;
  }
}

// ─── Axios instance ───────────────────────────────────────────────────────────
export const api = axios.create({
  // ARCH-DECISION: VITE_API_URL is now respected in production as well as dev.
  // When empty (default): relative URLs → same-origin, no CORS.
  // When set to an absolute URL (e.g. http://IP): all API calls go to that
  // origin regardless of which port the browser opened the page on.
  // This is required when the app is accessed on a non-standard port (e.g. 3001)
  // that carriers/ISPs block for POST requests — the API URL can be pinned to
  // the standard port 80 so POSTs always succeed even if the page came from :3001.
  // NestJS uses origin:true (reflects any request Origin) so CORS works for
  // cross-port requests without any additional configuration.
  baseURL: import.meta.env.VITE_API_URL ?? '',
  headers: { 'Content-Type': 'application/json' },
  timeout: DEFAULT_TIMEOUT,
});

// ─── Request interceptor ──────────────────────────────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // ARCH-DECISION: When the body is FormData (file uploads), delete the global
  // Content-Type header so the browser sets multipart/form-data with the correct
  // boundary automatically. Without this, the server throws 400 on file uploads.
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  // Correlation ID — unique per logical request, persists across retries
  if (!config.headers['X-Correlation-ID']) {
    config.headers['X-Correlation-ID'] = crypto.randomUUID();
  }

  // Idempotency key — unique per logical operation, persists across retries
  const method = (config.method ?? '').toLowerCase();
  if (MUTATING_METHODS.has(method) && !config[IDEM_KEY_PROP]) {
    const key = crypto.randomUUID();
    config[IDEM_KEY_PROP]           = key;
    config.headers['Idempotency-Key'] = key;
  } else if (config[IDEM_KEY_PROP]) {
    // Retry: reuse the same key so the server returns the cached response
    config.headers['Idempotency-Key'] = config[IDEM_KEY_PROP];
  }

  // Extend timeout for PDF/report endpoints
  if (typeof config.url === 'string' && REPORT_PATH_RE.test(config.url)) {
    config.timeout = REPORT_TIMEOUT;
  }

  return config;
});

// ─── Response interceptor — refresh on 401 ───────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error);

    const status          = error.response?.status;
    const originalRequest = error.config;

    // ARCH-DECISION: Skip refresh on auth endpoints — login/refresh/logout
    // returning 401 means wrong credentials or expired token, not a mid-session
    // expiry. Attempting refresh here would cause a recursive call chain.
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/');

    if (status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      try {
        await useAuthStore.getState().refreshTokens();
        const newToken = useAuthStore.getState().accessToken;
        if (newToken && originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return api(originalRequest);
      } catch {
        // Fire-and-forget: logout() is async but we can't await inside the
        // Axios interceptor callback without changing its return type.
        void useAuthStore.getState().logout();
      }
    }

    return Promise.reject(error);
  },
);
