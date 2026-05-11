import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { JwtPayload, Role } from '@haccp/shared-types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: JwtPayload | null;

  // Actions
  setTokens: (accessToken: string, refreshToken: string, user: JwtPayload) => void;
  refreshTokens: () => Promise<void>;
  logout: () => Promise<void>;

  // Derived helpers
  hasRole: (role: Role) => boolean;
  isSuperAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,

      setTokens: (accessToken, refreshToken, user) =>
        set({ accessToken, refreshToken, user }),

      refreshTokens: async () => {
        const { refreshToken } = get();
        if (!refreshToken) throw new Error('No refresh token');

        // Import api lazily to avoid circular dependency
        const { api } = await import('@/lib/api');
        const res = await api.post<{ accessToken: string; refreshToken: string; user: JwtPayload }>(
          '/api/v1/auth/refresh',
          { refreshToken },
        );
        set({
          accessToken: res.data.accessToken,
          refreshToken: res.data.refreshToken,
          user: res.data.user,
        });
      },

      logout: async () => {
        // ARCH-DECISION: Call the server-side logout endpoint BEFORE clearing
        // local state so the access token is still available for the Bearer
        // Authorization header. The server deletes the refresh token from the
        // DB, making token rotation impossible (replay attack protection).
        // Fire-and-forget: if the call fails (network down, token already
        // expired) we still clear local state — the refresh token will expire
        // naturally, and the server-side cleanup is best-effort.
        try {
          const { api } = await import('@/lib/api');
          await api.post('/api/v1/auth/logout');
        } catch {
          // Intentionally swallow — the user must always be able to log out
          // locally even when the server is unreachable.
        } finally {
          set({ accessToken: null, refreshToken: null, user: null });
        }
      },

      hasRole: (role) => get().user?.role === role,
      isSuperAdmin: () => get().user?.role === 'SUPER_ADMIN',
    }),
    {
      name: 'haccp-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    },
  ),
);
