/**
 * usePermissions — semantic permission checks for the current user.
 *
 * Combines role + module access into named boolean capabilities so that
 * components never have to repeat the (role AND module) logic inline.
 *
 * ARCH-DECISION: SUPER_ADMIN bypasses ALL restrictions — role and module.
 * This mirrors the backend ModuleGuard + RolesGuard behavior exactly.
 */

import { useAuthStore } from '@/store/auth.store';
import type { UserRole } from '@haccp/shared-types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hasRole(userRole: UserRole | undefined, roles: UserRole[]): boolean {
  if (!userRole) return false;
  if (userRole === 'SUPER_ADMIN') return true;
  return roles.includes(userRole);
}

function hasModuleAccess(
  userRole: UserRole | undefined,
  allowedModules: string[],
  moduleKey: string,
): boolean {
  if (!userRole) return false;
  if (userRole === 'SUPER_ADMIN') return true;
  return allowedModules.includes(moduleKey);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePermissions() {
  const user           = useAuthStore((s) => s.user);
  const allowedModules = useAuthStore((s) => s.allowedModules)();
  const role           = user?.role;

  const isSuperAdmin = role === 'SUPER_ADMIN';

  // ── Module access ──────────────────────────────────────────────────────────
  const canAccessModule = (moduleKey: string) =>
    hasModuleAccess(role, allowedModules, moduleKey);

  // ── Dashboard ──────────────────────────────────────────────────────────────
  const canViewDashboard =
    hasRole(role, ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER']) &&
    canAccessModule('DASHBOARD');

  // ── Controls / HACCP ──────────────────────────────────────────────────────
  const canViewControls =
    hasRole(role, ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'OPERATOR']) &&
    canAccessModule('HACCP_CONTROLS');

  const canManageControls =
    hasRole(role, ['ADMIN', 'MANAGER']) &&
    canAccessModule('HACCP_CONTROLS');

  // ── Nonconformities ───────────────────────────────────────────────────────
  const canViewNonconformities =
    hasRole(role, ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'OPERATOR']) &&
    canAccessModule('NONCONFORMITIES');

  const canCreateNonconformities =
    hasRole(role, ['ADMIN', 'MANAGER', 'OPERATOR']) &&
    canAccessModule('NONCONFORMITIES');

  const canCloseNonconformities =
    hasRole(role, ['ADMIN', 'MANAGER']) &&
    canAccessModule('NONCONFORMITIES');

  // ── DLC ───────────────────────────────────────────────────────────────────
  const canAccessDLC =
    hasRole(role, ['ADMIN', 'MANAGER', 'OPERATOR']) &&
    canAccessModule('DLC');

  // ── Asset referential ─────────────────────────────────────────────────────
  const canManageProducts =
    hasRole(role, ['ADMIN', 'MANAGER']) &&
    canAccessModule('PRODUCTS');

  const canManageEquipments =
    hasRole(role, ['ADMIN', 'MANAGER']) &&
    canAccessModule('EQUIPMENTS');

  const canManageSuppliers =
    hasRole(role, ['ADMIN', 'MANAGER']) &&
    canAccessModule('SUPPLIERS');

  // ── Zones ─────────────────────────────────────────────────────────────────
  // ARCH-DECISION: zones are tied to the HACCP_CONTROLS module — they are
  // control-point locations and only make sense when controls are enabled.
  const canManageZones =
    hasRole(role, ['ADMIN', 'MANAGER']) &&
    canAccessModule('HACCP_CONTROLS');

  // ── Documents / GED ───────────────────────────────────────────────────────
  const canAccessDocuments =
    hasRole(role, ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'OPERATOR']) &&
    canAccessModule('GED');

  // ── Reports ───────────────────────────────────────────────────────────────
  const canViewReports =
    hasRole(role, ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER']) &&
    canAccessModule('REPORTS');

  const canGenerateReports =
    hasRole(role, ['ADMIN', 'MANAGER']) &&
    canAccessModule('REPORTS');

  // ── Audit ─────────────────────────────────────────────────────────────────
  const canViewAudit =
    hasRole(role, ['ADMIN', 'MANAGER']) &&
    canAccessModule('AUDIT');

  // ── Administration (no module gate — RBAC role only) ──────────────────────
  const canManageUsers    = hasRole(role, ['ADMIN']);
  const canViewUsers      = hasRole(role, ['ADMIN', 'MANAGER']);
  const canManageGroups   = hasRole(role, ['ADMIN', 'MANAGER']);
  const canManageSettings = hasRole(role, ['ADMIN', 'MANAGER']);

  // ── Clients / Tenant management (SUPER_ADMIN only) ───────────────────────
  const canManageClients = isSuperAdmin || role === 'ADMIN';

  return {
    // Raw module access check
    canAccessModule,

    // Feature-level permissions
    canViewDashboard,
    canViewControls,
    canManageControls,
    canViewNonconformities,
    canCreateNonconformities,
    canCloseNonconformities,
    canAccessDLC,
    canManageProducts,
    canManageEquipments,
    canManageSuppliers,
    canManageZones,
    canAccessDocuments,
    canViewReports,
    canGenerateReports,
    canViewAudit,
    canManageUsers,
    canViewUsers,
    canManageGroups,
    canManageSettings,
    canManageClients,

    // Convenience
    isSuperAdmin,
    role,
    allowedModules,
  };
}
