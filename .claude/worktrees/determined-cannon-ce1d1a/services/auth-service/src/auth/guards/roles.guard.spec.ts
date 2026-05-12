/**
 * RolesGuard unit tests
 *
 * RolesGuard reads the @Roles() metadata set by the decorator,
 * then checks whether the authenticated user's role is included.
 *
 * We build a minimal ExecutionContext mock so canActivate() can be
 * called without a real HTTP request or NestJS module.
 */

import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard, ROLES_KEY } from './roles.guard';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal ExecutionContext stub.
 * `userRole`  — the role attached to req.user by JwtAuthGuard upstream.
 * `metaRoles` — what the reflector will return for this handler.
 */
function makeContext(userRole: string, metaRoles: string[] | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass:   () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: { role: userRole } }),
    }),
  } as unknown as ExecutionContext;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    guard = new RolesGuard(reflector);
  });

  // ── No metadata (open endpoint) ─────────────────────────────────────────────

  it('returns true when no @Roles() decorator is present (undefined)', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const result = guard.canActivate(makeContext('OPERATOR', undefined));

    expect(result).toBe(true);
  });

  it('returns true when @Roles() is applied with an empty array', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    const result = guard.canActivate(makeContext('VIEWER', []));

    expect(result).toBe(true);
  });

  // ── Role is in the required list ────────────────────────────────────────────

  it('returns true when user role exactly matches a single required role', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);

    const result = guard.canActivate(makeContext('ADMIN', ['ADMIN']));

    expect(result).toBe(true);
  });

  it('returns true when user role is one of several required roles', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN', 'MANAGER', 'SUPER_ADMIN']);

    const result = guard.canActivate(makeContext('MANAGER', ['ADMIN', 'MANAGER', 'SUPER_ADMIN']));

    expect(result).toBe(true);
  });

  it('returns true when SUPER_ADMIN is included and user is SUPER_ADMIN', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN', 'SUPER_ADMIN']);

    const result = guard.canActivate(makeContext('SUPER_ADMIN', ['ADMIN', 'SUPER_ADMIN']));

    expect(result).toBe(true);
  });

  // ── Role is NOT in the required list ────────────────────────────────────────

  it('returns false when user role is not in the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN', 'MANAGER']);

    const result = guard.canActivate(makeContext('OPERATOR', ['ADMIN', 'MANAGER']));

    expect(result).toBe(false);
  });

  it('returns false when VIEWER tries to access an ADMIN-only route', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);

    const result = guard.canActivate(makeContext('VIEWER', ['ADMIN']));

    expect(result).toBe(false);
  });

  it('returns false when OPERATOR tries to access a QUALITY_OFFICER route', () => {
    reflector.getAllAndOverride.mockReturnValue(['QUALITY_OFFICER', 'ADMIN', 'MANAGER']);

    const result = guard.canActivate(makeContext('OPERATOR', ['QUALITY_OFFICER', 'ADMIN', 'MANAGER']));

    expect(result).toBe(false);
  });

  // ── Reflector key ───────────────────────────────────────────────────────────

  it('reads metadata using the ROLES_KEY constant', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    const ctx = makeContext('ADMIN', ['ADMIN']);

    guard.canActivate(ctx);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
  });

  // ── RBAC matrix spot-checks (from CLAUDE.md) ────────────────────────────────

  it('blocks OPERATOR from dashboard-level routes (ADMIN + MANAGER only)', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN', 'MANAGER', 'SUPER_ADMIN']);

    const result = guard.canActivate(makeContext('OPERATOR', ['ADMIN', 'MANAGER', 'SUPER_ADMIN']));

    expect(result).toBe(false);
  });

  it('allows SUPER_ADMIN on all role-protected routes', () => {
    const allProtectedRoleSets = [
      ['ADMIN'],
      ['ADMIN', 'MANAGER'],
      ['ADMIN', 'MANAGER', 'QUALITY_OFFICER'],
      ['SUPER_ADMIN'],
    ];

    for (const roles of allProtectedRoleSets) {
      reflector.getAllAndOverride.mockReturnValue(roles);
      if (roles.includes('SUPER_ADMIN')) {
        const result = guard.canActivate(makeContext('SUPER_ADMIN', roles));
        expect(result).toBe(true);
      }
    }
  });
});
