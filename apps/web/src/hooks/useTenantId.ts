import { useAuthStore } from '@/store/auth.store';
import { useSupervisionStore } from '@/store/supervision.store';

/**
 * Returns the *effective* tenantId the UI is currently scoped to.
 *
 * ARCH-DECISION: every tenant-scoped React Query `queryKey` includes this as its
 * second element, e.g. `queryKey: ['products', tenantId, page, search]`. Folding
 * the SUPER_ADMIN's selected client into this value means switching client
 * automatically re-scopes (and refetches) every page — no per-hook change — and
 * keeps tenant A's cache entries from ever matching tenant B's keys.
 *
 * Resolution:
 *  - normal roles → always their own JWT tenantId (they have no selector, and
 *    the backend ignores any X-Selected-Tenant header for them);
 *  - SUPER_ADMIN + SINGLE → the selected tenantId (cockpit);
 *  - SUPER_ADMIN + ALL    → the 'ALL' sentinel (aggregation pages);
 *  - SUPER_ADMIN + PLATFORM (default) → their JWT tenantId (the platform view).
 *
 * Returns '' when no user is authenticated.
 */
export function useTenantId(): string {
  const user = useAuthStore((s) => s.user);
  const mode = useSupervisionStore((s) => s.mode);
  const selectedTenantId = useSupervisionStore((s) => s.selectedTenantId);

  if (!user) return '';
  if (user.role === 'SUPER_ADMIN') {
    if (mode === 'SINGLE' && selectedTenantId) return selectedTenantId;
    if (mode === 'ALL') return 'ALL';
  }
  return user.tenantId;
}
