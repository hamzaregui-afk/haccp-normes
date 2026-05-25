import axios, { type InternalAxiosRequestConfig } from 'axios';

import { useAuthStore } from '../store/authStore';

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

const GATEWAY_BASE =
  process.env['EXPO_PUBLIC_API_BASE_URL'] ?? 'http://10.0.2.2:80';

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
