/**
 * usePermissions — semantic permission checks for the current user.
 *
 * Combines role + module access into named boolean capabilities so that
 * components never repeat the (role AND module) logic inline.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │  Final role/access matrix                                                    │
 * │                                                                              │
 * │  SUPER_ADMIN  → platform operator: all tenants, SaaS backoffice (/clients)   │
 * │  ADMIN        → TENANT_ADMIN: full access within their ONE tenant.           │
 * │                 Mandatory modules: dashboard, controls, NCs, DLC,            │
 * │                 equipments, suppliers, zones, documents, users, groups,      │
 * │                 reports, audit, settings.                                    │
 * │                 Blocked: /clients (SaaS), products (MANAGER catalog).        │
 * │  MANAGER      → operational manager: controls, NCs, DLC, products + reports  │
 * │  QUALITY_OFFICER → quality ops: read + NC/reports write                     │
 * │  OPERATOR     → field: executes controls, NCs, DLC (mobile-first)           │
 * │  VIEWER       → read-only across all tenant data                            │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * ARCH-DECISION: SUPER_ADMIN bypasses ALL restrictions — role and module.
 * This mirrors the backend ModuleGuard + RolesGuard behavior exactly.
 *
 * ARCH-DECISION: "Mandatory modules" for TENANT_ADMIN are modules that are always
 * accessible regardless of tenant configuration. They are seeded at tenant creation
 * and guaranteed present in the JWT allowedModules array. The frontend module gate
 * (RequireModule) still applies — the guarantee is on the data, not bypassed here.
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
  // ADMIN sees the tenant-scoped dashboard (KPIs for their own tenant)
  const canViewDashboard =
    hasRole(role, ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER']) &&
    canAccessModule('DASHBOARD');

  // ── Controls / HACCP ──────────────────────────────────────────────────────
  // ADMIN: mandatory module — oversees controls within their tenant
  const canViewControls =
    hasRole(role, ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'OPERATOR']) &&
    canAccessModule('HACCP_CONTROLS');

  const canManageControls =
    hasRole(role, ['ADMIN', 'MANAGER']) &&
    canAccessModule('HACCP_CONTROLS');

  // ── Nonconformities ───────────────────────────────────────────────────────
  // ADMIN: mandatory module — tracks compliance issues in their tenant
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
  // ADMIN: mandatory module — oversees DLC operations within their tenant
  const canAccessDLC =
    hasRole(role, ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'OPERATOR']) &&
    canAccessModule('DLC');

  // ── Asset referential ─────────────────────────────────────────────────────
  // Products: catalog managed by ADMIN (within their tenant) and MANAGER
  const canManageProducts =
    hasRole(role, ['ADMIN', 'MANAGER']) &&
    canAccessModule('PRODUCTS');

  // Equipments/Suppliers: tenant setup — ADMIN mandatory, MANAGER operational
  const canManageEquipments =
    hasRole(role, ['ADMIN', 'MANAGER']) &&
    canAccessModule('EQUIPMENTS');

  const canManageSuppliers =
    hasRole(role, ['ADMIN', 'MANAGER']) &&
    canAccessModule('SUPPLIERS');

  // ── Zones ─────────────────────────────────────────────────────────────────
  // ARCH-DECISION: Zones are tied to HACCP_CONTROLS module (control-point locations).
  const canManageZones =
    hasRole(role, ['ADMIN', 'MANAGER']) &&
    canAccessModule('HACCP_CONTROLS');

  // ── Documents / GED ───────────────────────────────────────────────────────
  const canAccessDocuments =
    hasRole(role, ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'OPERATOR']) &&
    canAccessModule('GED');

  // ── Reports ───────────────────────────────────────────────────────────────
  // ADMIN: mandatory — views tenant compliance reports
  const canViewReports =
    hasRole(role, ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER']) &&
    canAccessModule('REPORTS');

  const canGenerateReports =
    hasRole(role, ['ADMIN', 'MANAGER']) &&
    canAccessModule('REPORTS');

  // ── Audit ─────────────────────────────────────────────────────────────────
  // ADMIN: mandatory — reviews tenant activity log
  const canViewAudit =
    hasRole(role, ['ADMIN', 'MANAGER']) &&
    canAccessModule('AUDIT');

  // ── Team management (role-only — no module gate) ──────────────────────────
  // ADMIN: core function — manages who has access to their tenant
  const canManageUsers  = hasRole(role, ['ADMIN']);
  const canViewUsers    = hasRole(role, ['ADMIN', 'MANAGER']);
  const canManageGroups = hasRole(role, ['ADMIN', 'MANAGER']);

  // Settings: local tenant settings only; global SaaS settings → SUPER_ADMIN only
  const canManageSettings = hasRole(role, ['ADMIN', 'MANAGER']);

  // ── Platform clients / SaaS backoffice ────────────────────────────────────
  // SUPER_ADMIN only — ADMIN (TENANT_ADMIN) NEVER sees cross-tenant data
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

    // Convenience flags
    isSuperAdmin,
    isTenantAdmin,
    role,
    allowedModules,
  };
}
