import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const SECURE_TOKEN_KEY         = 'haccp_jwt_token';
const SECURE_REFRESH_TOKEN_KEY = 'haccp_jwt_refresh_token';

// ARCH-DECISION: The mobile app stores both the access token and the refresh
// token in SecureStore. The access token is short-lived (15 min); the refresh
// token is long-lived and persisted so that it is available for future silent
// refresh implementations without requiring a full re-login. The actual silent
// refresh logic is not yet wired up — on expiry the user is still redirected to
// the login screen — but the token is persisted so the upgrade path is trivial.
export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: JwtPayload | null;
  setAuth: (token: string, user: JwtPayload, refreshToken?: string | null) => void;
  logout: () => Promise<void>;
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
        sub:      String(p['sub']),
        email:    String(p['email']),
        role:     String(p['role']),
        tenantId: String(p['tenantId']),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  refreshToken: null,
  user: null,

  setAuth: (token: string, user: JwtPayload, refreshToken?: string | null) => {
    // Persist access token to secure storage asynchronously; don't block the UI
    SecureStore.setItemAsync(SECURE_TOKEN_KEY, token).catch(() => {
      // Non-fatal: token will be re-fetched on next login if storage fails
    });
    // Persist refresh token if provided
    if (refreshToken) {
      SecureStore.setItemAsync(SECURE_REFRESH_TOKEN_KEY, refreshToken).catch(() => {});
    }
    set({ token, user, refreshToken: refreshToken ?? null });
  },

  logout: async () => {
    // ARCH-DECISION: Call the server-side logout endpoint so the refresh
    // token is deleted from the DB (replay attack protection). The access
    // token used here is still valid for the duration of this single call.
    // Fire-and-forget: if the network is unreachable, we still clear local
    // state — the server-side token will expire naturally.
    const { token } = get();
    if (token) {
      try {
        // Import lazily to avoid circular dependency with client.ts
        const { authClient } = await import('../api/client');
        await authClient.post('/auth/logout');
      } catch {
        // Intentionally swallow — user must always be able to log out locally
      }
    }

    await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(SECURE_REFRESH_TOKEN_KEY).catch(() => {});
    set({ token: null, refreshToken: null, user: null });
  },

  hydrateFromStorage: async () => {
    const stored = await SecureStore.getItemAsync(SECURE_TOKEN_KEY);
    if (!stored) return;
    const user = decodeJwtPayload(stored);
    if (user) {
      const storedRefreshToken = await SecureStore.getItemAsync(SECURE_REFRESH_TOKEN_KEY);
      set({ token: stored, user, refreshToken: storedRefreshToken ?? null });
    } else {
      // Token malformed — discard both tokens
      await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
      await SecureStore.deleteItemAsync(SECURE_REFRESH_TOKEN_KEY);
    }
  },
}));
