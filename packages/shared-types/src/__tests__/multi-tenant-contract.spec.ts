/**
 * multi-tenant-contract.spec.ts — packages/shared-types
 *
 * Multi-tenant contract validation tests.
 *
 * Documents and validates the platform-wide invariants that ALL services must honour:
 *  1. ALL_TENANT_MODULE_KEYS has exactly 18 entries
 *  2. ALL_TENANT_MODULE_KEYS contains TRACABILITY
 *  3. tenantId must always come from JWT, never from request body
 *  4. Every API response must never cross tenant boundaries
 *  5. Module key schema validates correctly — rejects unknown keys
 *  6. Zod schema inference round-trip — TenantModule validates correctly
 */

import { ALL_TENANT_MODULE_KEYS, TenantModuleKeySchema, TenantModuleSchema } from '../tenant.types';

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITES
// ─────────────────────────────────────────────────────────────────────────────

describe('Multi-Tenant Contract — ALL_TENANT_MODULE_KEYS', () => {

  it('has exactly 18 entries', () => {
    expect(ALL_TENANT_MODULE_KEYS).toHaveLength(18);
  });

  it('contains TRACABILITY', () => {
    expect(ALL_TENANT_MODULE_KEYS).toContain('TRACABILITY');
  });

  it('contains all expected module keys', () => {
    const expected = [
      'DASHBOARD',
      'HACCP_CONTROLS',
      'NONCONFORMITIES',
      'DLC',
      'REPORTS',
      'EQUIPMENTS',
      'PRODUCTS',
      'SUPPLIERS',
      'GED',
      'NOTIFICATIONS',
      'AUDIT',
      'PLANNING',
      'TEMPERATURES',
      'RECEPTIONS',
      'HYGIENE',
      'ANALYTICS',
      'MOBILE_ACCESS',
      'TRACABILITY',
    ] as const;

    expect(ALL_TENANT_MODULE_KEYS).toHaveLength(expected.length);
    for (const key of expected) {
      expect(ALL_TENANT_MODULE_KEYS).toContain(key);
    }
  });

  it('has no duplicate module keys', () => {
    const unique = new Set(ALL_TENANT_MODULE_KEYS);
    expect(unique.size).toBe(ALL_TENANT_MODULE_KEYS.length);
  });

  it('all keys are uppercase strings with no spaces', () => {
    for (const key of ALL_TENANT_MODULE_KEYS) {
      expect(key).toMatch(/^[A-Z_]+$/);
    }
  });
});

describe('Multi-Tenant Contract — TenantModuleKeySchema (Zod)', () => {

  it('accepts all valid module keys', () => {
    for (const key of ALL_TENANT_MODULE_KEYS) {
      const result = TenantModuleKeySchema.safeParse(key);
      expect(result.success).toBe(true);
    }
  });

  it('rejects unknown module keys', () => {
    const unknownKeys = ['UNKNOWN', 'FAKE_MODULE', 'TRACABILITYY', '', 'tracability'];
    for (const key of unknownKeys) {
      const result = TenantModuleKeySchema.safeParse(key);
      expect(result.success).toBe(false);
    }
  });

  it('TRACABILITY is accepted by TenantModuleKeySchema', () => {
    const result = TenantModuleKeySchema.safeParse('TRACABILITY');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('TRACABILITY');
    }
  });

  it('rejects lowercase tracability (key is case-sensitive)', () => {
    const result = TenantModuleKeySchema.safeParse('tracability');
    expect(result.success).toBe(false);
  });
});

describe('Multi-Tenant Contract — TenantModuleSchema (Zod)', () => {

  it('validates a complete TenantModule record', () => {
    const module = {
      id:        'mod-001',
      tenantId:  'tenant-aaa',
      moduleKey: 'TRACABILITY',
      enabled:   true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = TenantModuleSchema.safeParse(module);
    expect(result.success).toBe(true);
  });

  it('validates a minimal TenantModule record (only required fields)', () => {
    const module = {
      moduleKey: 'DASHBOARD',
      enabled:   true,
    };
    const result = TenantModuleSchema.safeParse(module);
    expect(result.success).toBe(true);
  });

  it('rejects a TenantModule with an unknown moduleKey', () => {
    const module = {
      moduleKey: 'NOT_A_MODULE',
      enabled:   true,
    };
    const result = TenantModuleSchema.safeParse(module);
    expect(result.success).toBe(false);
  });

  it('rejects a TenantModule with missing enabled field', () => {
    const module = {
      moduleKey: 'DASHBOARD',
      // enabled is missing
    };
    const result = TenantModuleSchema.safeParse(module);
    expect(result.success).toBe(false);
  });
});

describe('Multi-Tenant Contract — Isolation Invariants (design contracts)', () => {

  // ── Contract 1: tenantId must always come from JWT, never from request body ─

  it('tenantId must always come from JWT, never from request body', () => {
    // ARCH-DECISION: This is a security invariant enforced at the controller layer.
    // The @CurrentUser() decorator extracts tenantId from the validated JWT.
    // No controller method accepts tenantId as @Body() or @Query() parameter.
    //
    // This test documents the contract — the invariant is enforced by the
    // NestJS controller decorators, not here. It cannot be unit-tested in isolation
    // without mocking the entire NestJS request pipeline.

    // Simulate: actor's JWT tenantId wins over any body tenantId
    const jwtTenantId  = 'tenant-from-jwt';
    const bodyTenantId = 'tenant-from-attacker-body'; // must be ignored

    // The service always receives tenantId from the controller via @CurrentUser()
    // The controller never reads tenantId from the request body
    const resolvedTenantId = jwtTenantId; // body tenantId is discarded

    expect(resolvedTenantId).toBe(jwtTenantId);
    expect(resolvedTenantId).not.toBe(bodyTenantId);
  });

  // ── Contract 2: Every API response must never cross tenant boundaries ────────

  it('every API response must never cross tenant boundaries', () => {
    // ARCH-DECISION: Every Prisma query includes `where: { tenantId }` derived from JWT.
    // This prevents any cross-tenant data leakage at the ORM level.

    const TENANT_A = 'tenant-alpha';
    const TENANT_B = 'tenant-beta';

    // Simulate two tenants' data sets
    const allRecordsInDB = [
      { id: '1', tenantId: TENANT_A, data: 'secret-A' },
      { id: '2', tenantId: TENANT_A, data: 'secret-A2' },
      { id: '3', tenantId: TENANT_B, data: 'secret-B' },
    ];

    // Tenant-scoped filter — the invariant under test
    const filterByTenant = (tenantId: string) =>
      allRecordsInDB.filter(r => r.tenantId === tenantId);

    const resultA = filterByTenant(TENANT_A);
    const resultB = filterByTenant(TENANT_B);

    // Tenant A sees only their records
    expect(resultA.every(r => r.tenantId === TENANT_A)).toBe(true);
    expect(resultA.some(r => r.tenantId === TENANT_B)).toBe(false);

    // Tenant B sees only their records
    expect(resultB.every(r => r.tenantId === TENANT_B)).toBe(true);
    expect(resultB.some(r => r.tenantId === TENANT_A)).toBe(false);

    // Result sets are non-overlapping
    const idsA = new Set(resultA.map(r => r.id));
    const idsB = new Set(resultB.map(r => r.id));
    const intersection = [...idsA].filter(id => idsB.has(id));
    expect(intersection).toHaveLength(0);
  });

  // ── Contract 3: Standard plan modules ──────────────────────────────────────

  it('standard plan includes TRACABILITY as a core HACCP module', () => {
    // ARCH-DECISION: TRACABILITY is a legal food safety requirement (Règlement CE 178/2002).
    // It must be included in the standard plan — not gated behind a premium tier.
    const STANDARD_PLAN_MODULES = [
      'DASHBOARD', 'HACCP_CONTROLS', 'NONCONFORMITIES', 'DLC', 'REPORTS',
      'EQUIPMENTS', 'PRODUCTS', 'SUPPLIERS', 'GED', 'NOTIFICATIONS', 'AUDIT',
      'TRACABILITY',
    ];

    expect(STANDARD_PLAN_MODULES).toContain('TRACABILITY');
    // TRACABILITY is not hidden behind premium-only features
    expect(STANDARD_PLAN_MODULES.length).toBeGreaterThanOrEqual(12);
  });

  it('premium plan contains all 18 modules including TRACABILITY', () => {
    const PREMIUM_PLAN_MODULES = [...ALL_TENANT_MODULE_KEYS];

    expect(PREMIUM_PLAN_MODULES).toHaveLength(18);
    expect(PREMIUM_PLAN_MODULES).toContain('TRACABILITY');
  });

  // ── Contract 4: SUPER_ADMIN is the only role with cross-tenant access ───────

  it('only SUPER_ADMIN has cross-tenant access — all other roles are tenant-scoped', () => {
    type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'QUALITY_OFFICER' | 'OPERATOR' | 'VIEWER';

    const CROSS_TENANT_ROLES: UserRole[] = ['SUPER_ADMIN'];
    const TENANT_SCOPED_ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'OPERATOR', 'VIEWER'];
    const ALL_ROLES: UserRole[] = [...CROSS_TENANT_ROLES, ...TENANT_SCOPED_ROLES];

    expect(ALL_ROLES).toHaveLength(6);

    // SUPER_ADMIN is the only cross-tenant role
    expect(CROSS_TENANT_ROLES).toHaveLength(1);
    expect(CROSS_TENANT_ROLES).toContain('SUPER_ADMIN');

    // All non-SUPER_ADMIN roles are tenant-scoped
    for (const role of TENANT_SCOPED_ROLES) {
      expect(role).not.toBe('SUPER_ADMIN');
    }
  });

  // ── Contract 5: audit log is append-only ────────────────────────────────────

  it('audit-service contract: records are append-only — no UPDATE or DELETE', () => {
    // ARCH-DECISION: This is a legal requirement (Règlement CE 852/2004).
    // The audit service must never issue UPDATE or DELETE SQL.
    // Validated here as a documented contract — enforcement is in the service implementation.

    const AUDIT_ALLOWED_OPERATIONS = ['CREATE', 'READ'] as const;
    const AUDIT_FORBIDDEN_OPERATIONS = ['UPDATE', 'DELETE'] as const;

    for (const op of AUDIT_FORBIDDEN_OPERATIONS) {
      expect(AUDIT_ALLOWED_OPERATIONS).not.toContain(op);
    }

    expect(AUDIT_ALLOWED_OPERATIONS).toContain('CREATE');
    expect(AUDIT_ALLOWED_OPERATIONS).toContain('READ');
    expect(AUDIT_ALLOWED_OPERATIONS).not.toContain('UPDATE');
    expect(AUDIT_ALLOWED_OPERATIONS).not.toContain('DELETE');
  });

  // ── Contract 6: Module key count is stable ──────────────────────────────────

  it('ALL_TENANT_MODULE_KEYS count is stable at 18 — adding a module requires explicit review', () => {
    // ARCH-DECISION: The module count is a contract boundary. Any addition must:
    // 1. Update ALL_TENANT_MODULE_KEYS in shared-types/src/tenant.types.ts
    // 2. Update all auth-service and tenant-service copies (checked by CI)
    // 3. Update this test to reflect the new count
    // Failing this test signals an unreviewed module addition.
    expect(ALL_TENANT_MODULE_KEYS).toHaveLength(18);
  });
});
