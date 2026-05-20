/**
 * user.controller.spec.ts
 *
 * Unit tests for UserController — specifically the audit event emission
 * on create / update / delete.
 *
 * Strategy:
 *  - Mock @haccp/shared-utils emitAuditEvent
 *  - Mock UserService (no DB)
 *  - Instantiate UserController directly
 */

jest.mock('@haccp/shared-utils', () => ({
  emitAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

// ── Mocks for DTOs — let zod parse through without complaints ─────────────────
jest.mock('./dto/create-user.dto', () => ({
  CreateUserDtoSchema: { parse: (x: unknown) => x },
}));
jest.mock('./dto/update-user.dto', () => ({
  UpdateUserDtoSchema: { parse: (x: unknown) => x },
}));

import { emitAuditEvent } from '@haccp/shared-utils';
import { UserController } from './user.controller';
import type { JwtPayload } from '@haccp/shared-types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACTOR: JwtPayload = {
  sub:              'admin-001',
  email:            'admin@example.com',
  tenantId:         'tenant-abc',
  role:             'ADMIN',
  allowedModules:   [],
  subscriptionPlan: 'standard',
  tenantStatus:     'ACTIVE',
};

const USER_ID = 'user-xyz-001';

const CREATED_USER = { data: { id: USER_ID, email: 'bob@example.com', role: 'OPERATOR' } };
const UPDATED_USER = { data: { id: USER_ID, role: 'MANAGER' } };
const DELETED_USER = { message: 'User deleted' };

// ─── UserService mock ─────────────────────────────────────────────────────────

function makeUserServiceMock() {
  return {
    findAll:  jest.fn().mockResolvedValue({ data: [] }),
    findOne:  jest.fn().mockResolvedValue({ data: CREATED_USER }),
    create:   jest.fn().mockResolvedValue(CREATED_USER),
    update:   jest.fn().mockResolvedValue(UPDATED_USER),
    remove:   jest.fn().mockResolvedValue(DELETED_USER),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('UserController audit integration', () => {
  let controller: UserController;
  let userService: ReturnType<typeof makeUserServiceMock>;

  beforeEach(() => {
    userService = makeUserServiceMock();
    controller  = new UserController(userService as never);
    jest.clearAllMocks();
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = { email: 'bob@example.com', role: 'OPERATOR', password: 'Secret1!' };

    it('returns the created user', async () => {
      const result = await controller.create(dto, ACTOR);
      expect(result).toEqual(CREATED_USER);
    });

    it('calls UserService.create with parsed DTO and actor', async () => {
      await controller.create(dto, ACTOR);
      expect(userService.create).toHaveBeenCalledWith(dto, ACTOR);
    });

    it('emits a CREATE audit event', async () => {
      await controller.create(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId:   'admin-001',
          action:   'CREATE',
          resource: 'users',
          tenantId: 'tenant-abc',
        }),
      );
    });

    it('sets resourceId from the created user id', async () => {
      await controller.create(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: USER_ID }),
      );
    });

    it('still returns the created user when audit fails silently', async () => {
      (emitAuditEvent as jest.Mock).mockRejectedValueOnce(new Error('down'));
      const result = await controller.create(dto, ACTOR);
      expect(result).toEqual(CREATED_USER);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('emits an UPDATE audit event with the correct resourceId', async () => {
      await controller.update(USER_ID, { role: 'MANAGER' }, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:     'UPDATE',
          resource:   'users',
          resourceId: USER_ID,
          tenantId:   'tenant-abc',
        }),
      );
    });

    it('returns the updated user', async () => {
      const result = await controller.update(USER_ID, { role: 'MANAGER' }, ACTOR);
      expect(result).toEqual(UPDATED_USER);
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('emits a DELETE audit event with the correct resourceId', async () => {
      await controller.remove(USER_ID, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:     'DELETE',
          resource:   'users',
          resourceId: USER_ID,
          tenantId:   'tenant-abc',
        }),
      );
    });

    it('returns the deleted user result', async () => {
      const result = await controller.remove(USER_ID, ACTOR);
      expect(result).toEqual(DELETED_USER);
    });

    it('emits exactly one audit event', async () => {
      await controller.remove(USER_ID, ACTOR);
      await Promise.resolve();
      expect(emitAuditEvent).toHaveBeenCalledTimes(1);
    });
  });
});
