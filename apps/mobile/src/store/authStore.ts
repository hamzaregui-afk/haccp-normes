import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const SECURE_TOKEN_KEY = 'haccp_jwt_token';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
}

interface AuthState {
  token: string | null;
  user: JwtPayload | null;
  setAuth: (token: string, user: JwtPayload) => void;
  logout: () => void;
  hydrateFromStorage: () => Promise<void>;
}

/** Decode the payload segment of a JWT without verifying the signature.
 *  Verification happens server-side on every API call. */
function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // React Native's atob can have issues — use a manual base64 decode
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const decoded = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    const parsed: unknown = JSON.parse(decoded);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'sub' in parsed &&
      'email' in parsed &&
      'role' in parsed &&
      'tenantId' in parsed
    ) {
      const p = parsed as Record<string, unknown>;
      return {
        sub: String(p['sub']),
        email: String(p['email']),
        role: String(p['role']),
        tenantId: String(p['tenantId']),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,

  setAuth: (token: string, user: JwtPayload) => {
    // Persist to secure storage asynchronously; don't block the UI
    SecureStore.setItemAsync(SECURE_TOKEN_KEY, token).catch(() => {
      // Non-fatal: token will be re-fetched on next login if storage fails
    });
    set({ token, user });
  },

  logout: () => {
    SecureStore.deleteItemAsync(SECURE_TOKEN_KEY).catch(() => {});
    set({ token: null, user: null });
  },

  hydrateFromStorage: async () => {
    const stored = await SecureStore.getItemAsync(SECURE_TOKEN_KEY);
    if (!stored) return;
    const user = decodeJwtPayload(stored);
    if (user) {
      set({ token: stored, user });
    } else {
      // Token malformed — discard it
      await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
    }
  },
}));
