/**
 * tenant.controller.spec.ts
 *
 * Unit tests for TenantController — audit event emission on create / update / delete.
 * All tenant endpoints are SUPER_ADMIN only.
 *
 * Strategy:
 *  - Mock @haccp/shared-utils emitAuditEvent
 *  - Mock TenantService (no DB)
 *  - Mock DTO schemas (pass-through parse)
 *  - Instantiate TenantController directly (no NestJS DI overhead)
 */

jest.mock('@haccp/shared-utils', () => ({
  emitAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./dto/tenant.dto', () => ({
  CreateTenantDtoSchema: { parse: (x: unknown) => x },
  UpdateTenantDtoSchema: { parse: (x: unknown) => x },
}));

import { emitAuditEvent } from '@haccp/shared-utils';
import { TenantController } from './tenant.controller';
import type { JwtPayload } from '@haccp/shared-types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SUPER_ADMIN: JwtPayload = {
  sub:      'super-001',
  email:    'super@platform.com',
  tenantId: 'platform',
  role:     'SUPER_ADMIN',
};

const TENANT_ID = 'tenant-xyz-001';

const CREATED_TENANT = { data: { id: TENANT_ID, name: 'Acme Foods SARL' } };
const UPDATED_TENANT = { data: { id: TENANT_ID, name: 'Acme Foods & Co.' } };
const DELETED_TENANT = { message: 'Tenant deleted' };

// ─── TenantService mock ───────────────────────────────────────────────────────

function makeTenantServiceMock() {
  return {
    findAll: jest.fn().mockResolvedValue({ data: [] }),
    findOne: jest.fn().mockResolvedValue({ data: CREATED_TENANT }),
    create:  jest.fn().mockResolvedValue(CREATED_TENANT),
    update:  jest.fn().mockResolvedValue(UPDATED_TENANT),
    remove:  jest.fn().mockResolvedValue(DELETED_TENANT),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('TenantController audit integration', () => {
  let controller: TenantController;
  let tenantService: ReturnType<typeof makeTenantServiceMock>;

  beforeEach(() => {
    tenantService = makeTenantServiceMock();
    controller    = new TenantController(tenantService as never);
    jest.clearAllMocks();
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = { name: 'Acme Foods SARL', plan: 'ENTERPRISE' };

    it('returns the created tenant', async () => {
      const result = await controller.create(dto, SUPER_ADMIN);
      expect(result).toEqual(CREATED_TENANT);
    });

    it('emits a CREATE audit event with correct fields', async () => {
      await controller.create(dto, SUPER_ADMIN);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId:   'super-001',
          action:   'CREATE',
          resource: 'tenants',
          tenantId: 'platform',
        }),
      );
    });

    it('sets resourceId from the created tenant id', async () => {
      await controller.create(dto, SUPER_ADMIN);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: TENANT_ID }),
      );
    });

    it('includes tenant name in audit payload', async () => {
      await controller.create(dto, SUPER_ADMIN);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ name: 'Acme Foods SARL' }),
        }),
      );
    });

    it('still returns the tenant when audit fails silently', async () => {
      (emitAuditEvent as jest.Mock).mockRejectedValueOnce(new Error('down'));
      const result = await controller.create(dto, SUPER_ADMIN);
      expect(result).toEqual(CREATED_TENANT);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('emits an UPDATE audit event with the correct resourceId', async () => {
      await controller.update(TENANT_ID, { name: 'Acme Foods & Co.' }, SUPER_ADMIN);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:     'UPDATE',
          resource:   'tenants',
          resourceId: TENANT_ID,
          tenantId:   'platform',
        }),
      );
    });

    it('returns the updated tenant', async () => {
      const result = await controller.update(TENANT_ID, {}, SUPER_ADMIN);
      expect(result).toEqual(UPDATED_TENANT);
    });

    it('emits exactly one audit event', async () => {
      await controller.update(TENANT_ID, {}, SUPER_ADMIN);
      await Promise.resolve();
      expect(emitAuditEvent).toHaveBeenCalledTimes(1);
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('emits a DELETE audit event with the correct resourceId', async () => {
      await controller.remove(TENANT_ID, SUPER_ADMIN);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:     'DELETE',
          resource:   'tenants',
          resourceId: TENANT_ID,
          tenantId:   'platform',
        }),
      );
    });

    it('returns the deleted tenant result', async () => {
      const result = await controller.remove(TENANT_ID, SUPER_ADMIN);
      expect(result).toEqual(DELETED_TENANT);
    });

    it('emits exactly one audit event', async () => {
      await controller.remove(TENANT_ID, SUPER_ADMIN);
      await Promise.resolve();
      expect(emitAuditEvent).toHaveBeenCalledTimes(1);
    });
  });
});
