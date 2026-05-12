import axios from 'axios';

import { useAuthStore } from '@/store/auth.store';

/**
 * Axios instance pointing at the api-gateway.
 * All requests automatically carry the JWT Bearer token.
 * 401 responses trigger a token refresh; if refresh fails, logout.
 */
export const api = axios.create({
  // ARCH-DECISION: Empty baseURL means all requests use the current origin
  // (localhost:3000 in dev, served via nginx proxy). VITE_API_URL can override
  // for standalone API deployments.
  baseURL: import.meta.env.VITE_API_URL ?? '',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
});

// ─── Request interceptor — attach token ───────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // ARCH-DECISION: When the body is FormData (file uploads), delete the global
  // Content-Type: application/json so the browser/Axios can set the correct
  // multipart/form-data header with the boundary string automatically.
  // Without this, the server receives JSON content-type on a multipart body
  // and throws a 400 parse error on ALL file upload endpoints.
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// ─── Response interceptor — refresh on 401 ───────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error);

    const status = error.response?.status;
    const originalRequest = error.config;

    if (status === 401 && originalRequest && !('_retry' in originalRequest)) {
      (originalRequest as typeof originalRequest & { _retry: boolean })._retry = true;
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
