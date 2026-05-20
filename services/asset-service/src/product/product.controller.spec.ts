/**
 * product.controller.spec.ts
 *
 * Unit tests for ProductController — audit event emission on create / update / delete.
 *
 * Strategy:
 *  - Mock @haccp/shared-utils emitAuditEvent
 *  - Mock ProductService (no DB)
 *  - Mock DTO schemas (pass-through parse)
 *  - Instantiate ProductController directly (no NestJS DI overhead)
 */

jest.mock('@haccp/shared-utils', () => ({
  emitAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./dto/product.dto', () => ({
  CreateProductDtoSchema:  { parse: (x: unknown) => x },
  UpdateProductDtoSchema:  { parse: (x: unknown) => x },
  ProductQuerySchema:      { parse: (x: unknown) => x },
}));

import { emitAuditEvent } from '@haccp/shared-utils';
import { ProductController } from './product.controller';
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

const PRODUCT_ID = 'prod-xyz-001';

const CREATED_PRODUCT = { data: { id: PRODUCT_ID, name: 'Chicken Breast' } };
const UPDATED_PRODUCT = { data: { id: PRODUCT_ID, name: 'Chicken Breast XL' } };
const DELETED_PRODUCT = { message: 'Product deleted' };

// ─── ProductService mock ──────────────────────────────────────────────────────

function makeProductServiceMock() {
  return {
    findAll:        jest.fn().mockResolvedValue({ data: [] }),
    findCategories: jest.fn().mockResolvedValue({ data: [] }),
    findOne:        jest.fn().mockResolvedValue({ data: CREATED_PRODUCT }),
    create:         jest.fn().mockResolvedValue(CREATED_PRODUCT),
    update:         jest.fn().mockResolvedValue(UPDATED_PRODUCT),
    remove:         jest.fn().mockResolvedValue(DELETED_PRODUCT),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ProductController audit integration', () => {
  let controller: ProductController;
  let productService: ReturnType<typeof makeProductServiceMock>;

  beforeEach(() => {
    productService = makeProductServiceMock();
    controller     = new ProductController(productService as never);
    jest.clearAllMocks();
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = { name: 'Chicken Breast', category: 'MEAT' };

    it('returns the created product', async () => {
      const result = await controller.create(dto, ACTOR);
      expect(result).toEqual(CREATED_PRODUCT);
    });

    it('calls ProductService.create with dto and tenantId', async () => {
      await controller.create(dto, ACTOR);
      expect(productService.create).toHaveBeenCalledWith(dto, ACTOR.tenantId);
    });

    it('emits a CREATE audit event with correct fields', async () => {
      await controller.create(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId:   'admin-001',
          action:   'CREATE',
          resource: 'products',
          tenantId: 'tenant-abc',
        }),
      );
    });

    it('sets resourceId from the created product id', async () => {
      await controller.create(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: PRODUCT_ID }),
      );
    });

    it('includes product name in audit payload', async () => {
      await controller.create(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ payload: expect.objectContaining({ name: 'Chicken Breast' }) }),
      );
    });

    it('still returns the product when audit fails silently', async () => {
      (emitAuditEvent as jest.Mock).mockRejectedValueOnce(new Error('down'));
      const result = await controller.create(dto, ACTOR);
      expect(result).toEqual(CREATED_PRODUCT);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('emits an UPDATE audit event with the correct resourceId', async () => {
      await controller.update(PRODUCT_ID, { name: 'Chicken XL' }, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:     'UPDATE',
          resource:   'products',
          resourceId: PRODUCT_ID,
          tenantId:   'tenant-abc',
        }),
      );
    });

    it('returns the updated product', async () => {
      const result = await controller.update(PRODUCT_ID, { name: 'Chicken XL' }, ACTOR);
      expect(result).toEqual(UPDATED_PRODUCT);
    });

    it('emits exactly one audit event', async () => {
      await controller.update(PRODUCT_ID, {}, ACTOR);
      await Promise.resolve();
      expect(emitAuditEvent).toHaveBeenCalledTimes(1);
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('emits a DELETE audit event with the correct resourceId', async () => {
      await controller.remove(PRODUCT_ID, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:     'DELETE',
          resource:   'products',
          resourceId: PRODUCT_ID,
          tenantId:   'tenant-abc',
        }),
      );
    });

    it('returns the deleted product result', async () => {
      const result = await controller.remove(PRODUCT_ID, ACTOR);
      expect(result).toEqual(DELETED_PRODUCT);
    });

    it('emits exactly one audit event', async () => {
      await controller.remove(PRODUCT_ID, ACTOR);
      await Promise.resolve();
      expect(emitAuditEvent).toHaveBeenCalledTimes(1);
    });
  });
});
