/**
 * equipment.controller.spec.ts
 *
 * Unit tests for EquipmentController — audit event emission on create / update / delete.
 */

jest.mock('@haccp/shared-utils', () => ({
  emitAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./dto/equipment.dto', () => ({
  CreateEquipmentDtoSchema: { parse: (x: unknown) => x },
  UpdateEquipmentDtoSchema: { parse: (x: unknown) => x },
  EquipmentQuerySchema:     { parse: (x: unknown) => x },
}));

import { emitAuditEvent } from '@haccp/shared-utils';
import { EquipmentController } from './equipment.controller';
import type { JwtPayload } from '@haccp/shared-types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACTOR: JwtPayload = {
  sub:      'manager-001',
  email:    'manager@example.com',
  tenantId: 'tenant-abc',
  role:     'MANAGER',
};

const EQUIPMENT_ID = 'equip-xyz-001';

const CREATED_EQUIPMENT = { data: { id: EQUIPMENT_ID, name: 'Freezer A' } };
const UPDATED_EQUIPMENT = { data: { id: EQUIPMENT_ID, name: 'Freezer A (serviced)' } };
const DELETED_EQUIPMENT = { message: 'Equipment deleted' };

// ─── EquipmentService mock ────────────────────────────────────────────────────

function makeEquipmentServiceMock() {
  return {
    findAll: jest.fn().mockResolvedValue({ data: [] }),
    findOne: jest.fn().mockResolvedValue({ data: CREATED_EQUIPMENT }),
    create:  jest.fn().mockResolvedValue(CREATED_EQUIPMENT),
    update:  jest.fn().mockResolvedValue(UPDATED_EQUIPMENT),
    remove:  jest.fn().mockResolvedValue(DELETED_EQUIPMENT),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('EquipmentController audit integration', () => {
  let controller: EquipmentController;
  let equipmentService: ReturnType<typeof makeEquipmentServiceMock>;

  beforeEach(() => {
    equipmentService = makeEquipmentServiceMock();
    controller       = new EquipmentController(equipmentService as never);
    jest.clearAllMocks();
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = { name: 'Freezer A', type: 'REFRIGERATION' };

    it('returns the created equipment', async () => {
      const result = await controller.create(dto, ACTOR);
      expect(result).toEqual(CREATED_EQUIPMENT);
    });

    it('emits a CREATE audit event', async () => {
      await controller.create(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId:   'manager-001',
          action:   'CREATE',
          resource: 'equipments',
          tenantId: 'tenant-abc',
        }),
      );
    });

    it('sets resourceId from the created equipment id', async () => {
      await controller.create(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: EQUIPMENT_ID }),
      );
    });

    it('still returns equipment when audit fails silently', async () => {
      (emitAuditEvent as jest.Mock).mockRejectedValueOnce(new Error('down'));
      const result = await controller.create(dto, ACTOR);
      expect(result).toEqual(CREATED_EQUIPMENT);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('emits an UPDATE audit event with the correct resourceId', async () => {
      await controller.update(EQUIPMENT_ID, { name: 'Freezer A (v2)' }, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:     'UPDATE',
          resource:   'equipments',
          resourceId: EQUIPMENT_ID,
          tenantId:   'tenant-abc',
        }),
      );
    });

    it('returns the updated equipment', async () => {
      const result = await controller.update(EQUIPMENT_ID, {}, ACTOR);
      expect(result).toEqual(UPDATED_EQUIPMENT);
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('emits a DELETE audit event with the correct resourceId', async () => {
      await controller.remove(EQUIPMENT_ID, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:     'DELETE',
          resource:   'equipments',
          resourceId: EQUIPMENT_ID,
          tenantId:   'tenant-abc',
        }),
      );
    });

    it('returns the deleted equipment result', async () => {
      const result = await controller.remove(EQUIPMENT_ID, ACTOR);
      expect(result).toEqual(DELETED_EQUIPMENT);
    });

    it('emits exactly one audit event', async () => {
      await controller.remove(EQUIPMENT_ID, ACTOR);
      await Promise.resolve();
      expect(emitAuditEvent).toHaveBeenCalledTimes(1);
    });
  });
});
