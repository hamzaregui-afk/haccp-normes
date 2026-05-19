/**
 * usePermissions — semantic permission checks for the current user.
 *
 * Combines role + module access into named boolean capabilities so that
 * components never repeat the (role AND module) logic inline.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Role split summary                                                     │
 * │  SUPER_ADMIN  → platform operator: all tenants, SaaS backoffice         │
 * │  ADMIN        → TENANT_ADMIN: setup-only (assets, users, audit, reports)│
 * │  MANAGER      → operational: controls, NCs, DLC, full reporting          │
 * │  QUALITY_OFFICER → quality ops: read + NC/reports write                 │
 * │  OPERATOR     → field: executes controls, NCs, DLC (mobile-first)       │
 * │  VIEWER       → read-only across all tenant data                        │
 * └─────────────────────────────────────────────────────────────────────────┘
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

  const isSuperAdmin  = role === 'SUPER_ADMIN';
  const isTenantAdmin = role === 'ADMIN';

  // ── Module access ──────────────────────────────────────────────────────────
  const canAccessModule = (moduleKey: string) =>
    hasModuleAccess(role, allowedModules, moduleKey);

  // ── Dashboard ──────────────────────────────────────────────────────────────
  // ADMIN is excluded: their workspace is /equipments, not the KPI dashboard
  const canViewDashboard =
    hasRole(role, ['MANAGER', 'QUALITY_OFFICER', 'VIEWER']) &&
    canAccessModule('DASHBOARD');

  // ── Controls / HACCP ──────────────────────────────────────────────────────
  // ADMIN is excluded: managing controls is an operational role (MANAGER/QO)
  const canViewControls =
    hasRole(role, ['MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'OPERATOR']) &&
    canAccessModule('HACCP_CONTROLS');

  const canManageControls =
    hasRole(role, ['MANAGER']) &&
    canAccessModule('HACCP_CONTROLS');

  // ── Nonconformities ───────────────────────────────────────────────────────
  // ADMIN is excluded: NC lifecycle is an operational responsibility
  const canViewNonconformities =
    hasRole(role, ['MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'OPERATOR']) &&
    canAccessModule('NONCONFORMITIES');

  const canCreateNonconformities =
    hasRole(role, ['MANAGER', 'OPERATOR']) &&
    canAccessModule('NONCONFORMITIES');

  const canCloseNonconformities =
    hasRole(role, ['MANAGER']) &&
    canAccessModule('NONCONFORMITIES');

  // ── DLC ───────────────────────────────────────────────────────────────────
  // ADMIN excluded: label printing is an operational / field function
  const canAccessDLC =
    hasRole(role, ['MANAGER', 'QUALITY_OFFICER', 'OPERATOR']) &&
    canAccessModule('DLC');

  // ── Asset referential ─────────────────────────────────────────────────────
  // Products: operational catalog — ADMIN excluded
  const canManageProducts =
    hasRole(role, ['MANAGER']) &&
    canAccessModule('PRODUCTS');

  // Equipments/Suppliers: tenant setup — ADMIN included
  const canManageEquipments =
    hasRole(role, ['ADMIN', 'MANAGER']) &&
    canAccessModule('EQUIPMENTS');

  const canManageSuppliers =
    hasRole(role, ['ADMIN', 'MANAGER']) &&
    canAccessModule('SUPPLIERS');

  // ── Zones ─────────────────────────────────────────────────────────────────
  // ARCH-DECISION: Zones are tied to HACCP_CONTROLS module (control-point locations).
  // ADMIN manages the physical space setup; MANAGER uses zones operationally.
  const canManageZones =
    hasRole(role, ['ADMIN', 'MANAGER']) &&
    canAccessModule('HACCP_CONTROLS');

  // ── Documents / GED ───────────────────────────────────────────────────────
  const canAccessDocuments =
    hasRole(role, ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'OPERATOR']) &&
    canAccessModule('GED');

  // ── Reports ───────────────────────────────────────────────────────────────
  // ADMIN can view reports (tenant-level compliance reporting)
  const canViewReports =
    hasRole(role, ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER']) &&
    canAccessModule('REPORTS');

  const canGenerateReports =
    hasRole(role, ['MANAGER']) &&
    canAccessModule('REPORTS');

  // ── Audit ─────────────────────────────────────────────────────────────────
  // ADMIN can view the audit log (they need visibility into their tenant's activity)
  const canViewAudit =
    hasRole(role, ['ADMIN', 'MANAGER']) &&
    canAccessModule('AUDIT');

  // ── Team management (role-only — no module gate) ──────────────────────────
  // ADMIN creates/edits/deletes users and groups (their core admin function)
  const canManageUsers  = hasRole(role, ['ADMIN']);
  const canViewUsers    = hasRole(role, ['ADMIN', 'MANAGER']);
  const canManageGroups = hasRole(role, ['ADMIN', 'MANAGER']);

  // Settings: local tenant settings (ADMIN + MANAGER); global SaaS settings → SUPER_ADMIN only
  const canManageSettings = hasRole(role, ['ADMIN', 'MANAGER']);

  // ── Platform clients / SaaS backoffice (SUPER_ADMIN only) ─────────────────
  // ADMIN (TENANT_ADMIN) NEVER sees the /clients page or any cross-tenant data
  const canManageClients = isSuperAdmin;

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
    isTenantAdmin,
    role,
    allowedModules,
  };
}
