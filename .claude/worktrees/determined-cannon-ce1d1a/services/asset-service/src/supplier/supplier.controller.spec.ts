/**
 * supplier.controller.spec.ts
 *
 * Unit tests for SupplierController — audit event emission on create / update / delete.
 */

jest.mock('@haccp/shared-utils', () => ({
  emitAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./dto/supplier.dto', () => ({
  CreateSupplierDtoSchema: { parse: (x: unknown) => x },
  UpdateSupplierDtoSchema: { parse: (x: unknown) => x },
  SupplierQuerySchema:     { parse: (x: unknown) => x },
}));

import { emitAuditEvent } from '@haccp/shared-utils';
import { SupplierController } from './supplier.controller';
import type { JwtPayload } from '@haccp/shared-types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACTOR: JwtPayload = {
  sub:      'admin-001',
  email:    'admin@example.com',
  tenantId: 'tenant-abc',
  role:     'ADMIN',
};

const SUPPLIER_ID = 'supplier-xyz-001';

const CREATED_SUPPLIER = { data: { id: SUPPLIER_ID, name: 'Fresh Farms SARL' } };
const UPDATED_SUPPLIER = { data: { id: SUPPLIER_ID, name: 'Fresh Farms & Co.' } };
const DELETED_SUPPLIER = { message: 'Supplier deleted' };

// ─── SupplierService mock ─────────────────────────────────────────────────────

function makeSupplierServiceMock() {
  return {
    findAll: jest.fn().mockResolvedValue({ data: [] }),
    findOne: jest.fn().mockResolvedValue({ data: CREATED_SUPPLIER }),
    create:  jest.fn().mockResolvedValue(CREATED_SUPPLIER),
    update:  jest.fn().mockResolvedValue(UPDATED_SUPPLIER),
    remove:  jest.fn().mockResolvedValue(DELETED_SUPPLIER),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('SupplierController audit integration', () => {
  let controller: SupplierController;
  let supplierService: ReturnType<typeof makeSupplierServiceMock>;

  beforeEach(() => {
    supplierService = makeSupplierServiceMock();
    controller      = new SupplierController(supplierService as never);
    jest.clearAllMocks();
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = { name: 'Fresh Farms SARL', country: 'MA' };

    it('returns the created supplier', async () => {
      const result = await controller.create(dto, ACTOR);
      expect(result).toEqual(CREATED_SUPPLIER);
    });

    it('emits a CREATE audit event', async () => {
      await controller.create(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId:   'admin-001',
          action:   'CREATE',
          resource: 'suppliers',
          tenantId: 'tenant-abc',
        }),
      );
    });

    it('sets resourceId from the created supplier id', async () => {
      await controller.create(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: SUPPLIER_ID }),
      );
    });

    it('includes supplier name in audit payload', async () => {
      await controller.create(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ payload: expect.objectContaining({ name: 'Fresh Farms SARL' }) }),
      );
    });

    it('still returns the supplier when audit fails silently', async () => {
      (emitAuditEvent as jest.Mock).mockRejectedValueOnce(new Error('down'));
      const result = await controller.create(dto, ACTOR);
      expect(result).toEqual(CREATED_SUPPLIER);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('emits an UPDATE audit event with the correct resourceId', async () => {
      await controller.update(SUPPLIER_ID, { name: 'Fresh Farms & Co.' }, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:     'UPDATE',
          resource:   'suppliers',
          resourceId: SUPPLIER_ID,
          tenantId:   'tenant-abc',
        }),
      );
    });

    it('returns the updated supplier', async () => {
      const result = await controller.update(SUPPLIER_ID, {}, ACTOR);
      expect(result).toEqual(UPDATED_SUPPLIER);
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('emits a DELETE audit event with the correct resourceId', async () => {
      await controller.remove(SUPPLIER_ID, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:     'DELETE',
          resource:   'suppliers',
          resourceId: SUPPLIER_ID,
          tenantId:   'tenant-abc',
        }),
      );
    });

    it('returns the deleted supplier result', async () => {
      const result = await controller.remove(SUPPLIER_ID, ACTOR);
      expect(result).toEqual(DELETED_SUPPLIER);
    });

    it('emits exactly one audit event', async () => {
      await controller.remove(SUPPLIER_ID, ACTOR);
      await Promise.resolve();
      expect(emitAuditEvent).toHaveBeenCalledTimes(1);
    });
  });
});
