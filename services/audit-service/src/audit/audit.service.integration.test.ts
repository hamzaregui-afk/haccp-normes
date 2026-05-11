/**
 * audit.service.integration.test.ts
 *
 * Integration tests for AuditService against a real PostgreSQL database.
 *
 * Critical invariants verified:
 *  1. APPEND-ONLY: the Prisma model has no update/delete — this test suite
 *     confirms there is no way to mutate an existing log entry through the service.
 *  2. Tenant isolation: logs from tenant-A are never visible to tenant-B.
 *  3. Filtering: userId, resource, action, and date-range filters are applied correctly.
 *  4. Pagination: skip/take + metadata are computed accurately.
 *  5. findOne: NotFoundException when the record belongs to a different tenant.
 *
 * Requires Docker — Testcontainers spins up postgres:15-alpine, runs Prisma
 * migrations, then tears everything down in afterAll.
 *
 * Run: pnpm --filter @haccp/audit-service test:integration
 */

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { execSync } from 'child_process';
import * as path from 'path';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAuditLogDto, AuditQuery } from './dto/audit.dto';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-beta';
const USER_A   = 'user-001';
const USER_B   = 'user-002';

const BASE_DTO: CreateAuditLogDto = {
  action:     'USER_CREATED',
  resource:   'user',
  resourceId: 'user-abc',
  userId:     USER_A,
};

const DEFAULT_QUERY: AuditQuery = { page: 1, limit: 20 };

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('AuditService (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma:    PrismaClient;
  let service:   AuditService;

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:15-alpine')
      .withDatabase('haccp_audit_test')
      .withUsername('postgres')
      .withPassword('testpass')
      .start();

    const databaseUrl = container.getConnectionUri();
    process.env['DATABASE_URL'] = databaseUrl;

    execSync('pnpm prisma migrate deploy', {
      cwd:   path.resolve(__dirname, '../../'),
      env:   { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });

    prisma  = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();

    const prismaService = { auditLog: prisma.auditLog, $connect: jest.fn(), $disconnect: jest.fn() } as unknown as PrismaService;
    service = new AuditService(prismaService);
  }, 120_000);

  afterEach(async () => {
    await prisma.auditLog.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  // ── log (APPEND-ONLY) ──────────────────────────────────────────────────────

  describe('log', () => {
    it('creates an immutable log entry with correct fields', async () => {
      const result = await service.log(BASE_DTO, TENANT_A);

      expect(result.data.action).toBe('USER_CREATED');
      expect(result.data.resource).toBe('user');
      expect(result.data.tenantId).toBe(TENANT_A);
      expect(result.data.userId).toBe(USER_A);
      expect(result.data.id).toBeDefined();
      expect(result.data.createdAt).toBeDefined();
    });

    it('stores optional payload and ipAddress', async () => {
      const dto: CreateAuditLogDto = {
        ...BASE_DTO,
        payload:   { before: { name: 'old' }, after: { name: 'new' } },
        ipAddress: '10.0.0.1',
      };
      const result = await service.log(dto, TENANT_A);

      expect(result.data.ipAddress).toBe('10.0.0.1');
      expect(result.data.payload).toMatchObject({ before: { name: 'old' } });
    });

    it('APPEND-ONLY: service has no update or delete methods', () => {
      // Structural check — if these exist, someone broke the compliance constraint.
      expect((service as Record<string, unknown>)['update']).toBeUndefined();
      expect((service as Record<string, unknown>)['delete']).toBeUndefined();
      expect((service as Record<string, unknown>)['remove']).toBeUndefined();
    });

    it('APPEND-ONLY: Prisma model has no updatedAt column', async () => {
      const entry = await service.log(BASE_DTO, TENANT_A);
      expect((entry.data as Record<string, unknown>)['updatedAt']).toBeUndefined();
    });
  });

  // ── findAll — tenant isolation ─────────────────────────────────────────────

  describe('findAll — tenant isolation', () => {
    it('returns only logs belonging to the requesting tenant', async () => {
      await service.log({ ...BASE_DTO, action: 'A_EVENT' }, TENANT_A);
      await service.log({ ...BASE_DTO, action: 'B_EVENT' }, TENANT_B);

      const resultA = await service.findAll(TENANT_A, DEFAULT_QUERY);
      const resultB = await service.findAll(TENANT_B, DEFAULT_QUERY);

      expect(resultA.data).toHaveLength(1);
      expect(resultA.data[0].action).toBe('A_EVENT');
      expect(resultB.data).toHaveLength(1);
      expect(resultB.data[0].action).toBe('B_EVENT');
    });

    it('returns empty data when tenant has no logs', async () => {
      await service.log(BASE_DTO, TENANT_B);
      const result = await service.findAll(TENANT_A, DEFAULT_QUERY);
      expect(result.data).toHaveLength(0);
      expect(result.meta?.total).toBe(0);
    });
  });

  // ── findAll — filters ──────────────────────────────────────────────────────

  describe('findAll — filters', () => {
    beforeEach(async () => {
      await service.log({ action: 'USER_CREATED',  resource: 'user',    userId: USER_A }, TENANT_A);
      await service.log({ action: 'PRODUCT_ADDED', resource: 'product', userId: USER_B }, TENANT_A);
      await service.log({ action: 'USER_CREATED',  resource: 'user',    userId: USER_B }, TENANT_A);
    });

    it('filters by userId', async () => {
      const result = await service.findAll(TENANT_A, { ...DEFAULT_QUERY, userId: USER_A });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].userId).toBe(USER_A);
    });

    it('filters by resource', async () => {
      const result = await service.findAll(TENANT_A, { ...DEFAULT_QUERY, resource: 'product' });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].action).toBe('PRODUCT_ADDED');
    });

    it('filters by action', async () => {
      const result = await service.findAll(TENANT_A, { ...DEFAULT_QUERY, action: 'USER_CREATED' });
      expect(result.data).toHaveLength(2);
      expect(result.data.every((l) => l.action === 'USER_CREATED')).toBe(true);
    });

    it('date-range filter excludes entries outside range', async () => {
      const future = new Date(Date.now() + 60_000).toISOString();
      const result = await service.findAll(TENANT_A, { ...DEFAULT_QUERY, from: new Date(future) });
      expect(result.data).toHaveLength(0);
    });
  });

  // ── findAll — pagination ───────────────────────────────────────────────────

  describe('findAll — pagination', () => {
    beforeEach(async () => {
      // Create 5 log entries
      for (let i = 0; i < 5; i++) {
        await service.log({ ...BASE_DTO, action: `ACTION_${i}` }, TENANT_A);
      }
    });

    it('respects limit', async () => {
      const result = await service.findAll(TENANT_A, { page: 1, limit: 2 });
      expect(result.data).toHaveLength(2);
      expect(result.meta?.total).toBe(5);
    });

    it('returns correct page 2 results', async () => {
      const page1 = await service.findAll(TENANT_A, { page: 1, limit: 2 });
      const page2 = await service.findAll(TENANT_A, { page: 2, limit: 2 });
      const ids1  = page1.data.map((l) => l.id);
      const ids2  = page2.data.map((l) => l.id);
      expect(ids1).toHaveLength(2);
      expect(ids2).toHaveLength(2);
      expect(ids1.some((id) => ids2.includes(id))).toBe(false); // no overlap
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the log entry when it belongs to the tenant', async () => {
      const created = await service.log(BASE_DTO, TENANT_A);
      const found   = await service.findOne(created.data.id, TENANT_A);
      expect(found.data.id).toBe(created.data.id);
    });

    it('throws NotFoundException when id belongs to a different tenant', async () => {
      const created = await service.log(BASE_DTO, TENANT_A);
      await expect(service.findOne(created.data.id, TENANT_B)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for a non-existent id', async () => {
      await expect(service.findOne('non-existent-id', TENANT_A)).rejects.toThrow(NotFoundException);
    });
  });
});
