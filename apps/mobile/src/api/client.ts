import axios, { type InternalAxiosRequestConfig } from 'axios';

import { useAuthStore } from '../store/authStore';

// ARCH-DECISION: Each service gets its own axios instance pointing to its
// dedicated port. On Android emulator, 10.0.2.2 maps to the host machine's
// localhost. In production, these would be routed through the nginx api-gateway.
const BASE = 'http://10.0.2.2';

function createClient(port: number) {
  const instance = axios.create({
    baseURL: `${BASE}:${port}`,
    timeout: 10_000,
    headers: { 'Content-Type': 'application/json' },
  });

  // Inject Bearer token from Zustand store on every request
  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().token;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  return instance;
}

export const authClient           = createClient(3010);
export const controlClient        = createClient(3012);
export const nonconformityClient  = createClient(3013);
export const dlcClient            = createClient(3017);
export const tenantClient         = createClient(3018);

// ARCH-DECISION: Gateway client routes all requests through the nginx api-gateway
// on port 80. Use this for any service not covered by a dedicated client above.
export const apiClient = axios.create({
  baseURL: `${BASE}:80`,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().token;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
