/**
 * tenant-context.spec.ts — packages/shared-types
 *
 * Validates the SUPER_ADMIN multi-tenant supervision core: the effective-tenant
 * resolution matrix and the cross-tenant isolation guarantee for normal roles.
 *
 * Companion to multi-tenant-contract.spec.ts — this exercises the actual
 * resolver (resolveEffectiveTenant / canAccessTenant), not just documented
 * invariants.
 */

import type { JwtPayload, UserRole } from '../user.types';
import {
  ALL_TENANTS,
  PLATFORM_TENANT,
  SELECTED_TENANT_HEADER,
  CrossTenantAccessError,
  canAccessTenant,
  resolveEffectiveTenant,
  resolveRequestTenantId,
  parseModuleEnforcement,
} from '../tenant-context';

// Minimal principal — the resolver only reads role + tenantId.
const principal = (role: UserRole, tenantId: string): Pick<JwtPayload, 'role' | 'tenantId'> => ({
  role,
  tenantId,
});

const SUPER = principal('SUPER_ADMIN', PLATFORM_TENANT);
const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-beta';

describe('tenant-context — constants', () => {
  it('exposes the selection header in lowercase (Node normalises header names)', () => {
    expect(SELECTED_TENANT_HEADER).toBe('x-selected-tenant');
    expect(SELECTED_TENANT_HEADER).toBe(SELECTED_TENANT_HEADER.toLowerCase());
  });

  it('ALL sentinel and platform sentinel are distinct, non-empty', () => {
    expect(ALL_TENANTS).toBe('ALL');
    expect(PLATFORM_TENANT).toBe('platform');
    expect(ALL_TENANTS).not.toBe(PLATFORM_TENANT);
  });
});

describe('canAccessTenant', () => {
  it('SUPER_ADMIN can access any tenant', () => {
    expect(canAccessTenant(SUPER, TENANT_A)).toBe(true);
    expect(canAccessTenant(SUPER, TENANT_B)).toBe(true);
    expect(canAccessTenant(SUPER, 'anything-at-all')).toBe(true);
  });

  it('a normal user can access ONLY their own tenant', () => {
    const admin = principal('ADMIN', TENANT_A);
    expect(canAccessTenant(admin, TENANT_A)).toBe(true);
    expect(canAccessTenant(admin, TENANT_B)).toBe(false);
  });

  it.each<UserRole>(['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'OPERATOR', 'VIEWER'])(
    'role %s is tenant-scoped (no cross-tenant access)',
    (role) => {
      const user = principal(role, TENANT_A);
      expect(canAccessTenant(user, TENANT_A)).toBe(true);
      expect(canAccessTenant(user, TENANT_B)).toBe(false);
    },
  );
});

describe('resolveEffectiveTenant — SUPER_ADMIN', () => {
  it('no header → PLATFORM scoped to the JWT tenant (platform)', () => {
    const ctx = resolveEffectiveTenant(SUPER, undefined);
    expect(ctx).toEqual({
      mode: 'PLATFORM',
      effectiveTenantId: PLATFORM_TENANT,
      isSuperAdmin: true,
      selectedTenantId: null,
    });
  });

  it('empty / whitespace header is treated as no selection → PLATFORM', () => {
    expect(resolveEffectiveTenant(SUPER, '').mode).toBe('PLATFORM');
    expect(resolveEffectiveTenant(SUPER, '   ').mode).toBe('PLATFORM');
    expect(resolveEffectiveTenant(SUPER, '   ').selectedTenantId).toBeNull();
  });

  it('header = ALL → aggregation mode with null effective tenant', () => {
    const ctx = resolveEffectiveTenant(SUPER, ALL_TENANTS);
    expect(ctx.mode).toBe('ALL');
    expect(ctx.effectiveTenantId).toBeNull();
    expect(ctx.selectedTenantId).toBe(ALL_TENANTS);
    expect(ctx.isSuperAdmin).toBe(true);
  });

  it('ALL header is case-insensitive (all / All → aggregation)', () => {
    expect(resolveEffectiveTenant(SUPER, 'all').mode).toBe('ALL');
    expect(resolveEffectiveTenant(SUPER, 'All').mode).toBe('ALL');
    expect(resolveEffectiveTenant(SUPER, '  aLL ').mode).toBe('ALL');
  });

  it('header = a real tenantId → SINGLE scoped to that tenant', () => {
    const ctx = resolveEffectiveTenant(SUPER, TENANT_A);
    expect(ctx).toEqual({
      mode: 'SINGLE',
      effectiveTenantId: TENANT_A,
      isSuperAdmin: true,
      selectedTenantId: TENANT_A,
    });
  });

  it('trims surrounding whitespace on the selected tenantId', () => {
    const ctx = resolveEffectiveTenant(SUPER, `  ${TENANT_B}  `);
    expect(ctx.effectiveTenantId).toBe(TENANT_B);
  });

  it('switching selection recomputes the whole context (no stale tenant)', () => {
    expect(resolveEffectiveTenant(SUPER, TENANT_A).effectiveTenantId).toBe(TENANT_A);
    expect(resolveEffectiveTenant(SUPER, TENANT_B).effectiveTenantId).toBe(TENANT_B);
  });
});

describe('resolveEffectiveTenant — normal roles (isolation guarantee)', () => {
  it('no header → SINGLE scoped to their own tenant', () => {
    const ctx = resolveEffectiveTenant(principal('ADMIN', TENANT_A), undefined);
    expect(ctx).toEqual({
      mode: 'SINGLE',
      effectiveTenantId: TENANT_A,
      isSuperAdmin: false,
      selectedTenantId: null,
    });
  });

  it('header equal to their own tenant is accepted (harmless echo)', () => {
    const ctx = resolveEffectiveTenant(principal('MANAGER', TENANT_A), TENANT_A);
    expect(ctx.mode).toBe('SINGLE');
    expect(ctx.effectiveTenantId).toBe(TENANT_A);
    expect(ctx.isSuperAdmin).toBe(false);
  });

  it('header naming a DIFFERENT tenant throws CrossTenantAccessError', () => {
    const attacker = principal('ADMIN', TENANT_A);
    expect(() => resolveEffectiveTenant(attacker, TENANT_B)).toThrow(CrossTenantAccessError);
    try {
      resolveEffectiveTenant(attacker, TENANT_B);
    } catch (err) {
      expect(err).toBeInstanceOf(CrossTenantAccessError);
      const e = err as CrossTenantAccessError;
      expect(e.authenticatedTenantId).toBe(TENANT_A);
      expect(e.requestedTenantId).toBe(TENANT_B);
    }
  });

  it('a normal user CANNOT request ALL aggregation (ALL != own tenant → 403)', () => {
    const admin = principal('ADMIN', TENANT_A);
    expect(() => resolveEffectiveTenant(admin, ALL_TENANTS)).toThrow(CrossTenantAccessError);
  });

  it.each<UserRole>(['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'OPERATOR', 'VIEWER'])(
    'role %s can never escape its tenant via the header',
    (role) => {
      const user = principal(role, TENANT_A);
      expect(() => resolveEffectiveTenant(user, TENANT_B)).toThrow(CrossTenantAccessError);
      expect(resolveEffectiveTenant(user, undefined).effectiveTenantId).toBe(TENANT_A);
    },
  );
});

describe('resolveRequestTenantId (JWT strategy chokepoint — never throws)', () => {
  it('SUPER_ADMIN + selected tenant → that tenant', () => {
    expect(resolveRequestTenantId(SUPER, TENANT_A)).toBe(TENANT_A);
    expect(resolveRequestTenantId(SUPER, TENANT_B)).toBe(TENANT_B);
  });

  it('SUPER_ADMIN + no header → own JWT tenant (platform sentinel)', () => {
    expect(resolveRequestTenantId(SUPER, undefined)).toBe(PLATFORM_TENANT);
    expect(resolveRequestTenantId(SUPER, null)).toBe(PLATFORM_TENANT);
    expect(resolveRequestTenantId(SUPER, '')).toBe(PLATFORM_TENANT);
  });

  it('SUPER_ADMIN + ALL → own JWT tenant (aggregation handled elsewhere, lists stay empty)', () => {
    expect(resolveRequestTenantId(SUPER, ALL_TENANTS)).toBe(PLATFORM_TENANT);
  });

  it('handles a duplicated header value (string[]) by taking the first', () => {
    expect(resolveRequestTenantId(SUPER, [TENANT_B, TENANT_A])).toBe(TENANT_B);
  });

  it.each<UserRole>(['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'OPERATOR', 'VIEWER'])(
    'role %s is ALWAYS scoped to its own tenant — header ignored, never throws',
    (role) => {
      const user = principal(role, TENANT_A);
      expect(resolveRequestTenantId(user, undefined)).toBe(TENANT_A);
      expect(resolveRequestTenantId(user, TENANT_B)).toBe(TENANT_A); // stray header ignored, no throw
      expect(resolveRequestTenantId(user, ALL_TENANTS)).toBe(TENANT_A);
      expect(() => resolveRequestTenantId(user, TENANT_B)).not.toThrow();
    },
  );

  it('the header constant used by the strategy is stable', () => {
    expect(SELECTED_TENANT_HEADER).toBe('x-selected-tenant');
  });
});

describe('parseModuleEnforcement', () => {
  it('defaults to log (safe staged rollout) when unset/empty/unknown', () => {
    expect(parseModuleEnforcement(undefined)).toBe('log');
    expect(parseModuleEnforcement(null)).toBe('log');
    expect(parseModuleEnforcement('')).toBe('log');
    expect(parseModuleEnforcement('   ')).toBe('log');
    expect(parseModuleEnforcement('banana')).toBe('log');
  });

  it('parses strict and off (case/space-insensitive)', () => {
    expect(parseModuleEnforcement('strict')).toBe('strict');
    expect(parseModuleEnforcement('  STRICT ')).toBe('strict');
    expect(parseModuleEnforcement('off')).toBe('off');
    expect(parseModuleEnforcement('Off')).toBe('off');
    expect(parseModuleEnforcement('log')).toBe('log');
  });
});
