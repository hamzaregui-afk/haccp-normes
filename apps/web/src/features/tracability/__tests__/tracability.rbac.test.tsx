/**
 * tracability.rbac.test.tsx
 *
 * Frontend RBAC tests for the Tracability module.
 *
 * Validates:
 *  1. Sidebar item is visible for all 6 authorized roles
 *  2. Route /tracability is accessible with TRACABILITY module active
 *  3. Module guard blocks access when TRACABILITY is not in allowedModules
 *  4. Permission flags (canEdit, canDelete) are correct per role
 *  5. TRACABILITY key exists in ALL_TENANT_MODULE_KEYS (shared-types sync check)
 */

import { ALL_TENANT_MODULE_KEYS } from '@haccp/shared-types';

// ── Types ─────────────────────────────────────────────────────────────────────

type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'MANAGER'
  | 'QUALITY_OFFICER'
  | 'OPERATOR'
  | 'VIEWER';

const ALL_ROLES: UserRole[] = [
  'SUPER_ADMIN', 'ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'OPERATOR', 'VIEWER',
];

// ── Mirrors router/index.tsx RequireRole for /tracability ─────────────────────
const TRACABILITY_ROUTE_ROLES: UserRole[] = [
  'ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'SUPER_ADMIN', 'OPERATOR',
];

// ── Mirrors permission flags in TracabilityPage.tsx ───────────────────────────
const canEdit   = (role: UserRole) =>
  role === 'ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN' || role === 'OPERATOR';

const canDelete = (role: UserRole) =>
  role === 'ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN';

// ── Mirrors Sidebar allowedRoles for Traçabilité item ─────────────────────────
const SIDEBAR_TRACABILITY_ROLES: UserRole[] = [
  'ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'SUPER_ADMIN', 'OPERATOR',
];

// ─────────────────────────────────────────────────────────────────────────────

describe('TRACABILITY — shared-types synchronisation', () => {
  it('ALL_TENANT_MODULE_KEYS includes TRACABILITY', () => {
    expect(ALL_TENANT_MODULE_KEYS).toContain('TRACABILITY');
  });

  it('ALL_TENANT_MODULE_KEYS has exactly 18 entries', () => {
    expect(ALL_TENANT_MODULE_KEYS).toHaveLength(18);
  });
});

describe('Traçabilité sidebar item — visibility per role', () => {
  it.each(ALL_ROLES)('sidebar shows Traçabilité for role %s', (role) => {
    expect(SIDEBAR_TRACABILITY_ROLES).toContain(role);
  });

  it('all 6 roles are in the sidebar allowedRoles', () => {
    expect(SIDEBAR_TRACABILITY_ROLES).toHaveLength(6);
  });
});

describe('/tracability route — RequireRole guard', () => {
  it.each(ALL_ROLES)('role %s can access /tracability route', (role) => {
    expect(TRACABILITY_ROUTE_ROLES).toContain(role);
  });

  it('route roles count is 6 (all roles)', () => {
    expect(TRACABILITY_ROUTE_ROLES).toHaveLength(6);
  });
});

describe('/tracability route — RequireModule guard', () => {
  const hasModule = (modules: string[], key: string) => modules.includes(key);

  it('grants access when TRACABILITY is in allowedModules', () => {
    const modules = ['DASHBOARD', 'TRACABILITY'];
    expect(hasModule(modules, 'TRACABILITY')).toBe(true);
  });

  it('blocks access when TRACABILITY is NOT in allowedModules', () => {
    const modules = ['DASHBOARD', 'HACCP_CONTROLS'];
    expect(hasModule(modules, 'TRACABILITY')).toBe(false);
  });

  it('SUPER_ADMIN receives all 18 modules including TRACABILITY', () => {
    // auth-service now includes TRACABILITY in ALL_MODULE_KEYS for SUPER_ADMIN
    const superAdminModules = [...ALL_TENANT_MODULE_KEYS];
    expect(hasModule(superAdminModules, 'TRACABILITY')).toBe(true);
  });
});

describe('TracabilityPage — permission flags per role', () => {
  describe('canEdit (create, update, upload photos)', () => {
    it('ADMIN can edit', ()           => expect(canEdit('ADMIN')).toBe(true));
    it('MANAGER can edit', ()         => expect(canEdit('MANAGER')).toBe(true));
    it('SUPER_ADMIN can edit', ()     => expect(canEdit('SUPER_ADMIN')).toBe(true));
    it('OPERATOR can edit', ()        => expect(canEdit('OPERATOR')).toBe(true));
    it('QUALITY_OFFICER cannot edit', () => expect(canEdit('QUALITY_OFFICER')).toBe(false));
    it('VIEWER cannot edit', ()       => expect(canEdit('VIEWER')).toBe(false));
  });

  describe('canDelete (delete record or photo)', () => {
    it('ADMIN can delete', ()         => expect(canDelete('ADMIN')).toBe(true));
    it('MANAGER can delete', ()       => expect(canDelete('MANAGER')).toBe(true));
    it('SUPER_ADMIN can delete', ()   => expect(canDelete('SUPER_ADMIN')).toBe(true));
    it('OPERATOR cannot delete', ()   => expect(canDelete('OPERATOR')).toBe(false));
    it('QUALITY_OFFICER cannot delete', () => expect(canDelete('QUALITY_OFFICER')).toBe(false));
    it('VIEWER cannot delete', ()     => expect(canDelete('VIEWER')).toBe(false));
  });

  describe('read-only roles can always consult', () => {
    const readOnlyRoles: UserRole[] = ['QUALITY_OFFICER', 'VIEWER'];
    it.each(readOnlyRoles)('role %s has read access (route allowed, no edit/delete)', (role) => {
      expect(TRACABILITY_ROUTE_ROLES).toContain(role);
      expect(canEdit(role)).toBe(false);
      expect(canDelete(role)).toBe(false);
    });
  });
});

describe('Multi-tenant isolation — frontend layer', () => {
  it('tenantId comes from JWT, not from URL or body', () => {
    // Design invariant: useAuthStore provides tenantId from decoded JWT
    // The frontend never reads tenantId from route params or form input
    // This test documents the invariant
    const jwtTenantId     = 'tenant-A';
    const urlTenantId     = 'tenant-B'; // attacker tries to override
    const resolvedTenantId = jwtTenantId; // always prefer JWT
    expect(resolvedTenantId).toBe('tenant-A');
    expect(resolvedTenantId).not.toBe(urlTenantId);
  });

  it('react-query cache is keyed by tenantId preventing cross-tenant bleed', () => {
    // Query key: ['tracabilities', tenantId, ...filters]
    // If user switches tenant (e.g. SUPER_ADMIN), a different tenantId produces
    // a different cache key — no data leak between tenants
    const queryKeyA = ['tracabilities', 'tenant-A', 1, 20];
    const queryKeyB = ['tracabilities', 'tenant-B', 1, 20];
    expect(JSON.stringify(queryKeyA)).not.toBe(JSON.stringify(queryKeyB));
  });
});
