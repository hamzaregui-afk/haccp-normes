/**
 * audit.controller.spec.ts
 *
 * Unit tests for AuditController.
 *
 * Key invariants tested:
 *  - POST /audit delegates to AuditService.log with correct dto, tenantId, ipAddress
 *  - GET /audit delegates to AuditService.findAll with tenantId + parsed query
 *  - GET /audit/:id delegates to AuditService.findOne with id + tenantId
 *  - ipAddress is extracted from x-real-ip, x-forwarded-for, or req.ip (priority order)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import type { JwtPayload } from '@haccp/shared-types';

// ─── Stubs ────────────────────────────────────────────────────────────────────

const TENANT_ID  = 'tenant-abc';
const USER_ID    = 'user-123';
const AUDIT_ID   = 'cuid-audit-1';

const JWT_PAYLOAD: JwtPayload = {
  sub:      USER_ID,
  tenantId: TENANT_ID,
  role:     'ADMIN',
  email:    'admin@haccp.fr',
  iat:      0,
  exp:      9999999999,
};

const MOCK_LOG = {
  id:         AUDIT_ID,
  action:     'USER_CREATED',
  resource:   'user',
  resourceId: 'user-456',
  userId:     USER_ID,
  tenantId:   TENANT_ID,
  payload:    {},
  ipAddress:  '192.168.1.1',
  createdAt:  '2026-05-11T10:00:00.000Z',
};

const makeAuditServiceMock = () => ({
  log:     jest.fn().mockResolvedValue(MOCK_LOG),
  findAll: jest.fn().mockResolvedValue({ data: [MOCK_LOG], meta: { total: 1, page: 1, limit: 20, lastPage: 1 } }),
  findOne: jest.fn().mockResolvedValue(MOCK_LOG),
});

// ─── Helper: build a mock Express Request ────────────────────────────────────

function makeReq(overrides: {
  ip?: string;
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
} = {}) {
  return {
    ip:      overrides.ip ?? '10.0.0.1',
    headers: overrides.headers ?? {},
    query:   overrides.query ?? {},
  } as unknown as import('express').Request & { query: unknown };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuditController', () => {
  let controller: AuditController;
  let service: ReturnType<typeof makeAuditServiceMock>;

  beforeEach(async () => {
    service = makeAuditServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [{ provide: AuditService, useValue: service }],
    }).compile();

    controller = module.get<AuditController>(AuditController);
  });

  // ── POST /audit ─────────────────────────────────────────────────────────────

  describe('create', () => {
    const BODY = {
      action:     'USER_CREATED',
      resource:   'user',
      resourceId: 'user-456',
      payload:    {},
    };

    it('delegates to service.log with tenantId from JWT', async () => {
      const req = makeReq({ ip: '10.0.0.2' });
      await controller.create(BODY, JWT_PAYLOAD, req as never);
      expect(service.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_CREATED', ipAddress: '10.0.0.2' }),
        TENANT_ID,
      );
    });

    it('prefers x-real-ip header over req.ip', async () => {
      const req = makeReq({ ip: '10.0.0.2', headers: { 'x-real-ip': '203.0.113.5' } });
      await controller.create(BODY, JWT_PAYLOAD, req as never);
      expect(service.log).toHaveBeenCalledWith(
        expect.objectContaining({ ipAddress: '203.0.113.5' }),
        TENANT_ID,
      );
    });

    it('falls back to first x-forwarded-for IP when x-real-ip absent', async () => {
      const req = makeReq({
        headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.5' },
      });
      await controller.create(BODY, JWT_PAYLOAD, req as never);
      expect(service.log).toHaveBeenCalledWith(
        expect.objectContaining({ ipAddress: '198.51.100.1' }),
        TENANT_ID,
      );
    });

    it('returns the result from service.log', async () => {
      const result = await controller.create(BODY, JWT_PAYLOAD, makeReq() as never);
      expect(result).toEqual(MOCK_LOG);
    });
  });

  // ── GET /audit ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates to service.findAll with tenantId and parsed query', async () => {
      const req = makeReq({ query: { page: '1', limit: '20' } });
      await controller.findAll(JWT_PAYLOAD, req as never);
      expect(service.findAll).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ page: 1, limit: 20 }),
      );
    });

    it('returns paginated result', async () => {
      const result = await controller.findAll(JWT_PAYLOAD, makeReq() as never);
      expect(result.data).toHaveLength(1);
      expect(result.meta?.total).toBe(1);
    });
  });

  // ── GET /audit/:id ───────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('delegates to service.findOne with id and tenantId', async () => {
      await controller.findOne(AUDIT_ID, JWT_PAYLOAD);
      expect(service.findOne).toHaveBeenCalledWith(AUDIT_ID, TENANT_ID);
    });

    it('returns the audit log entry', async () => {
      const result = await controller.findOne(AUDIT_ID, JWT_PAYLOAD);
      expect(result).toEqual(MOCK_LOG);
    });
  });
});
