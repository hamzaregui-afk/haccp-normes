import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * supervision.store.ts — SUPER_ADMIN multi-tenant supervision context.
 *
 * Holds which client (tenant) the SUPER_ADMIN is currently supervising. This is
 * the frontend half of the effective-tenant mechanism:
 *  - the axios interceptor turns the selection into an `X-Selected-Tenant`
 *    header (see lib/api.ts), which the backend JwtStrategy honours ONLY for
 *    SUPER_ADMIN (see @haccp/shared-types resolveRequestTenantId);
 *  - useTenantId() folds the selection into every React Query key so switching
 *    client re-scopes the whole app.
 *
 * ARCH-DECISION: kept in its OWN persisted store (not the auth store) because it
 * is orthogonal to identity — it survives token refresh, is meaningless for
 * non-SUPER_ADMIN users, and must never be sent in the JWT. Switching selection
 * wipes the React Query cache so no previous tenant's data can flash on the new
 * client's pages (same guarantee logout already provides).
 */

export type SupervisionMode = 'PLATFORM' | 'ALL' | 'SINGLE';

interface SupervisionState {
  mode: SupervisionMode;
  selectedTenantId: string | null;
  selectedTenantName: string | null;

  /** Supervise a single client — the cockpit context. */
  selectTenant: (id: string, name: string) => void;
  /** Cross-tenant aggregation ("Tous les clients"). */
  selectAll: () => void;
  /** Platform backoffice view (no client selected) — the default. */
  selectPlatform: () => void;
}

async function wipeQueryCache(): Promise<void> {
  // Dynamic import avoids a load-time cycle between this store and the
  // QueryProvider module (mirrors auth.store's logout()).
  const { queryClient } = await import('@/lib/queryClient');
  queryClient.clear();
}

export const useSupervisionStore = create<SupervisionState>()(
  persist(
    (set) => ({
      mode: 'PLATFORM',
      selectedTenantId: null,
      selectedTenantName: null,

      selectTenant: (id, name) => {
        set({ mode: 'SINGLE', selectedTenantId: id, selectedTenantName: name });
        void wipeQueryCache();
      },
      selectAll: () => {
        set({ mode: 'ALL', selectedTenantId: null, selectedTenantName: null });
        void wipeQueryCache();
      },
      selectPlatform: () => {
        set({ mode: 'PLATFORM', selectedTenantId: null, selectedTenantName: null });
        void wipeQueryCache();
      },
    }),
    { name: 'haccp-supervision' },
  ),
);
