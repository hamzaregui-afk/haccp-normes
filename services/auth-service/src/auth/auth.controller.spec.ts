/**
 * auth.controller.spec.ts
 *
 * Unit tests for AuthController.
 *
 * Focus: verifying that audit events are emitted correctly on login,
 * and that audit failures never break the login response.
 *
 * Strategy:
 *  - Mock AuthService (no real JWT / DB)
 *  - Mock emitAuditEvent from @haccp/shared-utils
 *  - Instantiate AuthController directly (no NestJS DI overhead)
 */

// ── Mocks must be hoisted before imports ─────────────────────────────────────

jest.mock('@haccp/shared-utils', () => ({
  emitAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { emitAuditEvent } from '@haccp/shared-utils';
import { AuthController } from './auth.controller';
import type { JwtPayload } from '@haccp/shared-types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const JWT_PAYLOAD: JwtPayload = {
  sub:              'user-001',
  email:            'alice@example.com',
  tenantId:         'tenant-abc',
  role:             'ADMIN',
  allowedModules:   [],
  subscriptionPlan: 'standard',
  tenantStatus:     'ACTIVE',
};

const TOKEN_PAIR = {
  accessToken:  'access.token.here',
  refreshToken: 'refresh.token.here',
};

// ─── AuthService mock ─────────────────────────────────────────────────────────

function makeAuthServiceMock() {
  return {
    login:   jest.fn().mockResolvedValue(TOKEN_PAIR),
    refresh: jest.fn().mockResolvedValue(TOKEN_PAIR),
    logout:  jest.fn().mockResolvedValue(undefined),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('AuthController', () => {
  let controller: AuthController;
  let authService: ReturnType<typeof makeAuthServiceMock>;

  beforeEach(() => {
    authService  = makeAuthServiceMock();
    controller   = new AuthController(authService as never);
    jest.clearAllMocks();
  });

  // ── health ─────────────────────────────────────────────────────────────────

  describe('health', () => {
    it('returns status ok', () => {
      const result = controller.health();
      expect(result.status).toBe('ok');
    });

    it('returns uptime as a number', () => {
      const result = controller.health();
      expect(typeof result.uptime).toBe('number');
    });
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('returns the token pair from AuthService', async () => {
      const result = await controller.login({ user: JWT_PAYLOAD });
      expect(result).toEqual(TOKEN_PAIR);
    });

    it('calls AuthService.login with the JWT payload from the request', async () => {
      await controller.login({ user: JWT_PAYLOAD });
      expect(authService.login).toHaveBeenCalledWith(JWT_PAYLOAD);
    });

    it('emits a LOGIN audit event with correct fields', async () => {
      await controller.login({ user: JWT_PAYLOAD });

      // Allow the microtask queue to flush (void fire-and-forget)
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId:     'user-001',
          action:     'LOGIN',
          resource:   'users',
          resourceId: 'user-001',
          tenantId:   'tenant-abc',
        }),
      );
    });

    it('includes the user email in the audit payload', async () => {
      await controller.login({ user: JWT_PAYLOAD });
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ email: 'alice@example.com' }),
        }),
      );
    });

    it('still returns tokens when audit emission fails', async () => {
      (emitAuditEvent as jest.Mock).mockRejectedValueOnce(new Error('audit-service down'));

      const result = await controller.login({ user: JWT_PAYLOAD });

      // Fire-and-forget — error is swallowed inside emitAuditEvent itself
      expect(result).toEqual(TOKEN_PAIR);
    });

    it('emits exactly one audit event per login', async () => {
      await controller.login({ user: JWT_PAYLOAD });
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledTimes(1);
    });
  });

  // ── logout ─────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('calls AuthService.logout with the user sub', async () => {
      await controller.logout({ user: JWT_PAYLOAD });
      expect(authService.logout).toHaveBeenCalledWith('user-001');
    });

    it('emits a LOGOUT audit event', async () => {
      await controller.logout({ user: JWT_PAYLOAD });
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId:  'user-001',
          action:  'LOGOUT',
          tenantId: 'tenant-abc',
        }),
      );
    });

    it('returns undefined (HTTP 204 No Content)', async () => {
      const result = await controller.logout({ user: JWT_PAYLOAD });
      expect(result).toBeUndefined();
    });
  });

  // ── me ─────────────────────────────────────────────────────────────────────

  describe('me', () => {
    it('returns the user from the JWT', () => {
      const result = controller.me({ user: JWT_PAYLOAD });
      expect(result).toEqual(JWT_PAYLOAD);
    });
  });
});
