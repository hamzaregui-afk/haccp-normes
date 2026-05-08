import axios from 'axios';

import { useAuthStore } from '@/store/auth.store';

/**
 * Axios instance pointing at the api-gateway.
 * All requests automatically carry the JWT Bearer token.
 * 401 responses trigger a token refresh; if refresh fails, logout.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8080',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
});

// ─── Request interceptor — attach token ───────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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
        useAuthStore.getState().logout();
      }
    }

    return Promise.reject(error);
  },
);
