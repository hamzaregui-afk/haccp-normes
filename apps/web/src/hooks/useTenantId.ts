import { useAuthStore } from '@/store/auth.store';

/**
 * Returns the tenantId from the current JWT payload.
 *
 * ARCH-DECISION: This hook exists so every React Query `queryKey` that contains
 * tenant-scoped data can include the tenantId as its second element, e.g.
 *   `queryKey: ['products', tenantId, page, search]`
 *
 * This prevents two classes of cross-tenant cache bugs:
 *  1. SUPER_ADMIN navigating between tenant management views in the same session
 *     could see stale tenant-A data on tenant-B's page if tenantId is not in the key.
 *  2. A race between `queryClient.clear()` (fired on logout) and an in-flight
 *     query settling could re-populate the cache with stale data before the new
 *     tenant's queries run — namespacing by tenantId makes any leftover entries
 *     harmless because they never match the new tenant's query keys.
 *
 * Returns '' (empty string) when no user is authenticated — React Query will
 * not fetch when the component unmounts or when the key is semantically empty.
 */
export function useTenantId(): string {
  return useAuthStore((s) => s.user?.tenantId ?? '');
}
