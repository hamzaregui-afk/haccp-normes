/**
 * audit.service.spec.ts
 *
 * Unit tests for AuditService.
 *
 * Key invariants tested:
 *  - The service is APPEND-ONLY: no update() or delete() methods exist.
 *  - Every query is scoped to a tenantId (cross-tenant isolation).
 *  - Pagination metadata is computed correctly.
 *  - Optional filters (userId, resource, action, date range) are forwarded to Prisma.
 *  - findOne throws NotFoundException when the record does not belong to the tenant.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAuditLogDto, AuditQuery } from './dto/audit.dto';

// ─── Prisma mock factory ──────────────────────────────────────────────────────

const makePrismaAuditLogMock = () => ({
  create: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
  findFirst: jest.fn(),
  // Intentionally no `update` or `delete` — append-only by law
});

type PrismaAuditLogMock = ReturnType<typeof makePrismaAuditLogMock>;

const makePrismaServiceMock = () => ({
  auditLog: makePrismaAuditLogMock(),
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_A = 'tenant-aaa';
const TENANT_B = 'tenant-bbb';
const USER_ID  = 'user-001';

const makeEntry = (overrides: Partial<{
  id: string;
  tenantId: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string | null;
  payload: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
}> = {}) => ({
  id:         overrides.id         ?? 'log-001',
  tenantId:   overrides.tenantId   ?? TENANT_A,
  userId:     overrides.userId     ?? USER_ID,
  action:     overrides.action     ?? 'CREATE',
  resource:   overrides.resource   ?? 'products',
  resourceId: overrides.resourceId ?? 'prod-001',
  payload:    overrides.payload    ?? null,
  ipAddress:  overrides.ipAddress  ?? '127.0.0.1',
  createdAt:  overrides.createdAt  ?? new Date('2026-01-01T12:00:00Z'),
});

const DEFAULT_QUERY: AuditQuery = {
  page:  1,
  limit: 50,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AuditService', () => {
  let service: AuditService;
  let prismaAuditLog: PrismaAuditLogMock;

  beforeEach(async () => {
    const prismaServiceMock = makePrismaServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: prismaServiceMock },
      ],
    }).compile();

    service       = module.get(AuditService);
    prismaAuditLog = prismaServiceMock.auditLog;
  });

  afterEach(() => jest.clearAllMocks());

  // ── 1. Append-only contract ────────────────────────────────────────────────

  it('does NOT expose an update() method (append-only contract)', () => {
    // ARCH-DECISION: The audit_log table is immutable by HACCP regulation.
    // Any update() method on AuditService would be a compliance violation.
    expect((service as unknown as Record<string, unknown>)['update']).toBeUndefined();
    expect((service as unknown as Record<string, unknown>)['delete']).toBeUndefined();
    expect((service as unknown as Record<string, unknown>)['remove']).toBeUndefined();
  });

  // ── 2. log() — create an audit entry ─────────────────────────────────────

  it('log(): creates an audit entry and wraps it in ApiResponse', async () => {
    const dto: CreateAuditLogDto = {
      userId:     USER_ID,
      action:     'CREATE',
      resource:   'products',
      resourceId: 'prod-001',
      payload:    { name: 'Chicken' },
      ipAddress:  '10.0.0.1',
    };
    const created = makeEntry({ tenantId: TENANT_A, ...dto });
    prismaAuditLog.create.mockResolvedValue(created);

    const result = await service.log(dto, TENANT_A);

    expect(prismaAuditLog.create).toHaveBeenCalledTimes(1);
    expect(prismaAuditLog.create).toHaveBeenCalledWith({
      data: { ...dto, tenantId: TENANT_A },
    });
    expect(result.data).toEqual(created);
    expect(result.message).toBe('Audit log created');
  });

  it('log(): always injects tenantId from the JWT payload, not from the DTO', async () => {
    const dto: CreateAuditLogDto = {
      userId:   USER_ID,
      action:   'LOGIN',
      resource: 'users',
    };
    const created = makeEntry({ tenantId: TENANT_A, action: 'LOGIN', resource: 'users' });
    prismaAuditLog.create.mockResolvedValue(created);

    await service.log(dto, TENANT_A);

    const callArg = prismaAuditLog.create.mock.calls[0][0] as { data: { tenantId: string } };
    expect(callArg.data.tenantId).toBe(TENANT_A);
  });

  // ── 3. findAll() — pagination ─────────────────────────────────────────────

  it('findAll(): returns paginated results with correct meta', async () => {
    const entries = [makeEntry({ id: 'log-001' }), makeEntry({ id: 'log-002' })];
    prismaAuditLog.findMany.mockResolvedValue(entries);
    prismaAuditLog.count.mockResolvedValue(42);

    const query: AuditQuery = { page: 2, limit: 10 };
    const result = await service.findAll(TENANT_A, query);

    expect(prismaAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where:   expect.objectContaining({ tenantId: TENANT_A }),
        skip:    10,   // (page 2 - 1) * limit 10
        take:    10,
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(result.data).toEqual(entries);
    expect(result.meta).toEqual({
      total:    42,
      page:     2,
      limit:    10,
      lastPage: 5, // ceil(42/10)
    });
  });

  // ── 4. findAll() — optional filters forwarded to Prisma ──────────────────

  it('findAll(): forwards userId, resource, action and date filters to Prisma where clause', async () => {
    prismaAuditLog.findMany.mockResolvedValue([]);
    prismaAuditLog.count.mockResolvedValue(0);

    const from = new Date('2026-01-01T00:00:00Z');
    const to   = new Date('2026-01-31T23:59:59Z');

    const query: AuditQuery = {
      page:     1,
      limit:    50,
      userId:   USER_ID,
      resource: 'products',
      action:   'CREATE',
      from,
      to,
    };

    await service.findAll(TENANT_A, query);

    const whereArg = (prismaAuditLog.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(whereArg).toMatchObject({
      tenantId:  TENANT_A,
      userId:    USER_ID,
      resource:  'products',
      action:    'CREATE',
      createdAt: { gte: from, lte: to },
    });
  });

  // ── 5. Cross-tenant isolation ─────────────────────────────────────────────

  it('findAll(): scopes results to tenantId — never leaks cross-tenant data', async () => {
    prismaAuditLog.findMany.mockResolvedValue([]);
    prismaAuditLog.count.mockResolvedValue(0);

    await service.findAll(TENANT_B, DEFAULT_QUERY);

    const whereArg = (prismaAuditLog.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    // Must only query TENANT_B — never TENANT_A
    expect(whereArg['tenantId']).toBe(TENANT_B);
    expect(whereArg['tenantId']).not.toBe(TENANT_A);
  });

  // ── 6. findOne() — happy path ─────────────────────────────────────────────

  it('findOne(): returns the entry wrapped in ApiResponse when it belongs to the tenant', async () => {
    const entry = makeEntry({ id: 'log-xyz', tenantId: TENANT_A });
    prismaAuditLog.findFirst.mockResolvedValue(entry);

    const result = await service.findOne('log-xyz', TENANT_A);

    expect(prismaAuditLog.findFirst).toHaveBeenCalledWith({
      where: { id: 'log-xyz', tenantId: TENANT_A },
    });
    expect(result.data).toEqual(entry);
  });

  // ── 7. findOne() — cross-tenant guard ─────────────────────────────────────

  it('findOne(): throws NotFoundException when the entry does not exist for the given tenant', async () => {
    // Prisma returns null when the record belongs to a different tenant or does not exist
    prismaAuditLog.findFirst.mockResolvedValue(null);

    await expect(service.findOne('log-xyz', TENANT_B)).rejects.toThrow(NotFoundException);
    await expect(service.findOne('log-xyz', TENANT_B)).rejects.toThrow('AuditLog log-xyz not found');
  });

  // ── 8. findAll() — no optional filters (clean where clause) ───────────────

  it('findAll(): omits optional filter keys when query contains only page and limit', async () => {
    prismaAuditLog.findMany.mockResolvedValue([]);
    prismaAuditLog.count.mockResolvedValue(0);

    await service.findAll(TENANT_A, DEFAULT_QUERY);

    const whereArg = (prismaAuditLog.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(Object.keys(whereArg)).toEqual(['tenantId']);
  });
});
