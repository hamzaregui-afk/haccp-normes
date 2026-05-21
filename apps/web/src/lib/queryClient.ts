import { QueryClient } from '@tanstack/react-query';

/**
 * Module-level singleton so both QueryProvider and auth.store can reference
 * the same instance.
 *
 * ARCH-DECISION: Exporting a singleton (rather than creating inside useState)
 * lets auth.store call `queryClient.clear()` on logout, wiping all cached
 * tenant data before the next user logs in. Without this, stale data from
 * Tenant A would remain in the React Query cache and could flash briefly when
 * Tenant B authenticates — a cross-tenant data leak.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:           1000 * 60 * 5,   // 5 min
      retry:               1,
      refetchOnWindowFocus: false,
    },
  },
});
