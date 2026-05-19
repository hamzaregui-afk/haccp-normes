/**
 * useModules — tenant module access hook.
 *
 * Returns the list of modules enabled for the current user's tenant, and a
 * helper to check if a specific module is accessible.
 *
 * ARCH-DECISION: SUPER_ADMIN bypasses all module checks and always gets the
 * full module list regardless of what the JWT contains. This mirrors the
 * backend ModuleGuard behavior.
 */

import { useAuthStore } from '@/store/auth.store';

export function useModules() {
  const hasModule      = useAuthStore((s) => s.hasModule);
  const allowedModules = useAuthStore((s) => s.allowedModules);
  const user           = useAuthStore((s) => s.user);

  return {
    /** Full list of enabled module keys for the current user */
    allowedModules: allowedModules(),

    /** Returns true if the specified module is enabled for this user/tenant */
    hasModule: (moduleKey: string) => hasModule(moduleKey),

    /** True when module data is present (user is authenticated) */
    isLoaded: !!user,

    /** True when the user is a SUPER_ADMIN (bypasses all module restrictions) */
    isSuperAdmin: user?.role === 'SUPER_ADMIN',
  };
}
