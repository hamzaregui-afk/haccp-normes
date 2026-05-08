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
  logout: () => void;

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

      logout: () => set({ accessToken: null, refreshToken: null, user: null }),

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
