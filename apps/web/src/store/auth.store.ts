import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { JwtPayload, UserRole } from '@haccp/shared-types';

// Legacy alias kept for compatibility
type Role = UserRole;

// All 18 module keys — mirrored from shared-types for SUPER_ADMIN fallback
const ALL_MODULES = [
  'DASHBOARD', 'HACCP_CONTROLS', 'NONCONFORMITIES', 'DLC', 'REPORTS',
  'EQUIPMENTS', 'PRODUCTS', 'SUPPLIERS', 'GED', 'NOTIFICATIONS', 'AUDIT',
  'PLANNING', 'TEMPERATURES', 'RECEPTIONS', 'HYGIENE', 'ANALYTICS', 'MOBILE_ACCESS',
  'TRACABILITY',
] as const;

interface AuthState {
  accessToken:  string | null;
  refreshToken: string | null;
  user:         JwtPayload | null;

  // Actions
  setTokens:     (accessToken: string, refreshToken: string, user: JwtPayload) => void;
  refreshTokens: () => Promise<void>;
  logout:        () => Promise<void>;

  // Role helpers
  hasRole:      (role: Role) => boolean;
  isSuperAdmin: () => boolean;

  // Module helpers
  // ARCH-DECISION: SUPER_ADMIN always returns true — their JWT carries all module
  // keys but we double-guard here for stale tokens issued before this field existed.
  hasModule:      (moduleKey: string) => boolean;
  allowedModules: () => string[];
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken:  null,
      refreshToken: null,
      user:         null,

      setTokens: (accessToken, refreshToken, user) =>
        set({ accessToken, refreshToken, user }),

      refreshTokens: async () => {
        const { refreshToken } = get();
        if (!refreshToken) throw new Error('No refresh token');

        const { api } = await import('@/lib/api');
        const res = await api.post<{ accessToken: string; refreshToken: string; user: JwtPayload }>(
          '/api/v1/auth/refresh',
          { refreshToken },
        );
        set({
          accessToken:  res.data.accessToken,
          refreshToken: res.data.refreshToken,
          user:         res.data.user,
        });
      },

      logout: async () => {
        // ARCH-DECISION: Call server-side logout BEFORE clearing local state so
        // the access token is still available for the Authorization header.
        // Fire-and-forget: if the call fails we still clear local state.
        try {
          const { api } = await import('@/lib/api');
          await api.post('/api/v1/auth/logout');
        } catch {
          // Intentionally swallow — user must always be able to log out locally
        } finally {
          set({ accessToken: null, refreshToken: null, user: null });
          // ARCH-DECISION: Wipe the entire React Query cache on logout so that
          // stale data from one tenant session can never flash or leak to the
          // next authenticated user (even if they share the same browser tab).
          // Dynamic import avoids a circular dependency between the store and
          // the QueryProvider module at load time.
          const { queryClient } = await import('@/lib/queryClient');
          queryClient.clear();
        }
      },

      hasRole: (role) => get().user?.role === role,

      isSuperAdmin: () => get().user?.role === 'SUPER_ADMIN',

      hasModule: (moduleKey) => {
        const user = get().user;
        if (!user) return false;
        if (user.role === 'SUPER_ADMIN') return true;
        return (user.allowedModules ?? []).includes(moduleKey);
      },

      allowedModules: () => {
        const user = get().user;
        if (!user) return [];
        if (user.role === 'SUPER_ADMIN') return [...ALL_MODULES];
        return user.allowedModules ?? [];
      },
    }),
    {
      name: 'haccp-auth',
      partialize: (state) => ({
        accessToken:  state.accessToken,
        refreshToken: state.refreshToken,
        user:         state.user,
      }),
    },
  ),
);
