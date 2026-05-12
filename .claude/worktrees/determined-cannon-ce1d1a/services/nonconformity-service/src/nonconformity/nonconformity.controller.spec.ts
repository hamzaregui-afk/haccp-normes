/**
 * nonconformity.controller.spec.ts
 *
 * Unit tests for NonconformityController — audit event emission on
 * create / update / delete.
 *
 * Strategy:
 *  - Mock @haccp/shared-utils emitAuditEvent
 *  - Mock NonconformityService (no DB)
 *  - Mock DTO schemas (pass-through parse)
 *  - Instantiate NonconformityController directly (no NestJS DI overhead)
 */

jest.mock('@haccp/shared-utils', () => ({
  emitAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./dto/nonconformity.dto', () => ({
  CreateNcDtoSchema: { parse: (x: unknown) => x },
  UpdateNcDtoSchema: { parse: (x: unknown) => x },
  NcQuerySchema:     { parse: (x: unknown) => x },
}));

import { emitAuditEvent } from '@haccp/shared-utils';
import { NonconformityController } from './nonconformity.controller';
import type { JwtPayload } from '@haccp/shared-types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACTOR: JwtPayload = {
  sub:      'manager-001',
  email:    'manager@example.com',
  tenantId: 'tenant-abc',
  role:     'MANAGER',
};

const NC_ID = 'nc-xyz-001';

const CREATED_NC = {
  data: {
    id:          NC_ID,
    severity:    'HIGH',
    category:    'TEMPERATURE',
    status:      'OPEN',
    description: 'Freezer temp exceeded 4°C',
  },
};
const UPDATED_NC = { data: { id: NC_ID, status: 'CLOSED' } };
const DELETED_NC = { message: 'Non-conformity deleted' };

// ─── NonconformityService mock ────────────────────────────────────────────────

function makeNcServiceMock() {
  return {
    getStats: jest.fn().mockResolvedValue({ data: {} }),
    findAll:  jest.fn().mockResolvedValue({ data: [] }),
    findOne:  jest.fn().mockResolvedValue({ data: CREATED_NC }),
    create:   jest.fn().mockResolvedValue(CREATED_NC),
    update:   jest.fn().mockResolvedValue(UPDATED_NC),
    remove:   jest.fn().mockResolvedValue(DELETED_NC),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('NonconformityController audit integration', () => {
  let controller: NonconformityController;
  let ncService: ReturnType<typeof makeNcServiceMock>;

  beforeEach(() => {
    ncService  = makeNcServiceMock();
    controller = new NonconformityController(ncService as never);
    jest.clearAllMocks();
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      description: 'Freezer temp exceeded 4°C',
      severity:    'HIGH',
      category:    'TEMPERATURE',
    };

    it('returns the created NC', async () => {
      const result = await controller.create(dto, ACTOR);
      expect(result).toEqual(CREATED_NC);
    });

    it('calls NonconformityService.create with dto, tenantId, and actor sub', async () => {
      await controller.create(dto, ACTOR);
      expect(ncService.create).toHaveBeenCalledWith(dto, ACTOR.tenantId, ACTOR.sub);
    });

    it('emits a CREATE audit event with correct fields', async () => {
      await controller.create(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId:   'manager-001',
          action:   'CREATE',
          resource: 'nonconformities',
          tenantId: 'tenant-abc',
        }),
      );
    });

    it('sets resourceId from the created NC id', async () => {
      await controller.create(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: NC_ID }),
      );
    });

    it('includes severity and category in audit payload', async () => {
      await controller.create(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            severity: 'HIGH',
            category: 'TEMPERATURE',
          }),
        }),
      );
    });

    it('still returns NC when audit fails silently', async () => {
      (emitAuditEvent as jest.Mock).mockRejectedValueOnce(new Error('down'));
      const result = await controller.create(dto, ACTOR);
      expect(result).toEqual(CREATED_NC);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('emits an UPDATE audit event with the correct resourceId', async () => {
      await controller.update(NC_ID, { status: 'CLOSED' }, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:     'UPDATE',
          resource:   'nonconformities',
          resourceId: NC_ID,
          tenantId:   'tenant-abc',
        }),
      );
    });

    it('includes status in audit payload', async () => {
      await controller.update(NC_ID, { status: 'CLOSED' }, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ status: 'CLOSED' }),
        }),
      );
    });

    it('returns the updated NC', async () => {
      const result = await controller.update(NC_ID, { status: 'CLOSED' }, ACTOR);
      expect(result).toEqual(UPDATED_NC);
    });

    it('emits exactly one audit event', async () => {
      await controller.update(NC_ID, {}, ACTOR);
      await Promise.resolve();
      expect(emitAuditEvent).toHaveBeenCalledTimes(1);
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('emits a DELETE audit event with the correct resourceId', async () => {
      await controller.remove(NC_ID, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:     'DELETE',
          resource:   'nonconformities',
          resourceId: NC_ID,
          tenantId:   'tenant-abc',
        }),
      );
    });

    it('returns the deleted NC result', async () => {
      const result = await controller.remove(NC_ID, ACTOR);
      expect(result).toEqual(DELETED_NC);
    });

    it('emits exactly one audit event', async () => {
      await controller.remove(NC_ID, ACTOR);
      await Promise.resolve();
      expect(emitAuditEvent).toHaveBeenCalledTimes(1);
    });
  });
});
