/**
 * useTenant — current user's tenant context hook.
 *
 * Exposes tenant-level metadata carried in the JWT: tenantId, plan, status.
 * Does not make any API calls — reads exclusively from the auth store.
 */

import { useAuthStore } from '@/store/auth.store';

export function useTenant() {
  const user = useAuthStore((s) => s.user);

  return {
    tenantId:         user?.tenantId ?? null,
    subscriptionPlan: user?.subscriptionPlan ?? 'standard',
    tenantStatus:     user?.tenantStatus ?? 'ACTIVE',
    isSuperAdmin:     user?.role === 'SUPER_ADMIN',
    isActive:         (user?.tenantStatus ?? 'ACTIVE') === 'ACTIVE',
    isSuspended:      user?.tenantStatus === 'SUSPENDED',
  };
}
