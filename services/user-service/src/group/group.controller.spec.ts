/**
 * group.controller.spec.ts
 *
 * Unit tests for GroupController — audit event emission on group create / delete,
 * and member add / remove (both emit UPDATE on the group resource).
 *
 * Strategy:
 *  - Mock @haccp/shared-utils emitAuditEvent
 *  - Mock GroupService (no DB)
 *  - Mock DTO schemas (pass-through parse)
 *  - Instantiate GroupController directly (no NestJS DI overhead)
 */

jest.mock('@haccp/shared-utils', () => ({
  emitAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./dto/create-group.dto', () => ({
  CreateGroupDtoSchema: { parse: (x: unknown) => x },
  AddMemberDtoSchema:   { parse: (x: unknown) => x },
}));

import { emitAuditEvent } from '@haccp/shared-utils';
import { GroupController } from './group.controller';
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

const GROUP_ID  = 'group-xyz-001';
const MEMBER_ID = 'user-member-001';

const CREATED_GROUP = { data: { id: GROUP_ID, name: 'Quality Team' } };
const DELETED_GROUP = { message: 'Group deleted' };
const ADD_RESULT    = { data: { id: GROUP_ID, members: [MEMBER_ID] } };
const REMOVE_RESULT = { data: { id: GROUP_ID, members: [] } };

// ─── GroupService mock ────────────────────────────────────────────────────────

function makeGroupServiceMock() {
  return {
    findAll:      jest.fn().mockResolvedValue({ data: [] }),
    findOne:      jest.fn().mockResolvedValue({ data: CREATED_GROUP }),
    create:       jest.fn().mockResolvedValue(CREATED_GROUP),
    addMember:    jest.fn().mockResolvedValue(ADD_RESULT),
    removeMember: jest.fn().mockResolvedValue(REMOVE_RESULT),
    remove:       jest.fn().mockResolvedValue(DELETED_GROUP),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('GroupController audit integration', () => {
  let controller: GroupController;
  let groupService: ReturnType<typeof makeGroupServiceMock>;

  beforeEach(() => {
    groupService = makeGroupServiceMock();
    controller   = new GroupController(groupService as never);
    jest.clearAllMocks();
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = { name: 'Quality Team' };

    it('returns the created group', async () => {
      const result = await controller.create(dto, ACTOR);
      expect(result).toEqual(CREATED_GROUP);
    });

    it('emits a CREATE audit event with correct fields', async () => {
      await controller.create(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId:   'admin-001',
          action:   'CREATE',
          resource: 'groups',
          tenantId: 'tenant-abc',
        }),
      );
    });

    it('sets resourceId from the created group id', async () => {
      await controller.create(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: GROUP_ID }),
      );
    });

    it('includes group name in audit payload', async () => {
      await controller.create(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ name: 'Quality Team' }),
        }),
      );
    });

    it('still returns the group when audit fails silently', async () => {
      (emitAuditEvent as jest.Mock).mockRejectedValueOnce(new Error('down'));
      const result = await controller.create(dto, ACTOR);
      expect(result).toEqual(CREATED_GROUP);
    });
  });

  // ── addMember ──────────────────────────────────────────────────────────────

  describe('addMember', () => {
    const dto = { userId: MEMBER_ID };

    it('returns the updated group with the new member', async () => {
      const result = await controller.addMember(GROUP_ID, dto, ACTOR);
      expect(result).toEqual(ADD_RESULT);
    });

    it('emits an UPDATE audit event (group resource) with correct resourceId', async () => {
      await controller.addMember(GROUP_ID, dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:     'UPDATE',
          resource:   'groups',
          resourceId: GROUP_ID,
          tenantId:   'tenant-abc',
        }),
      );
    });

    it('includes addMember action and memberId in audit payload', async () => {
      await controller.addMember(GROUP_ID, dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            action:   'addMember',
            memberId: MEMBER_ID,
          }),
        }),
      );
    });

    it('emits exactly one audit event', async () => {
      await controller.addMember(GROUP_ID, dto, ACTOR);
      await Promise.resolve();
      expect(emitAuditEvent).toHaveBeenCalledTimes(1);
    });
  });

  // ── removeMember ───────────────────────────────────────────────────────────

  describe('removeMember', () => {
    it('returns the updated group without the member', async () => {
      const result = await controller.removeMember(GROUP_ID, MEMBER_ID, ACTOR);
      expect(result).toEqual(REMOVE_RESULT);
    });

    it('emits an UPDATE audit event with correct resourceId', async () => {
      await controller.removeMember(GROUP_ID, MEMBER_ID, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:     'UPDATE',
          resource:   'groups',
          resourceId: GROUP_ID,
          tenantId:   'tenant-abc',
        }),
      );
    });

    it('includes removeMember action and memberId in audit payload', async () => {
      await controller.removeMember(GROUP_ID, MEMBER_ID, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            action:   'removeMember',
            memberId: MEMBER_ID,
          }),
        }),
      );
    });
  });

  // ── remove (group) ─────────────────────────────────────────────────────────

  describe('remove', () => {
    it('emits a DELETE audit event with the correct resourceId', async () => {
      await controller.remove(GROUP_ID, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:     'DELETE',
          resource:   'groups',
          resourceId: GROUP_ID,
          tenantId:   'tenant-abc',
        }),
      );
    });

    it('returns the deleted group result', async () => {
      const result = await controller.remove(GROUP_ID, ACTOR);
      expect(result).toEqual(DELETED_GROUP);
    });

    it('emits exactly one audit event', async () => {
      await controller.remove(GROUP_ID, ACTOR);
      await Promise.resolve();
      expect(emitAuditEvent).toHaveBeenCalledTimes(1);
    });
  });
});
