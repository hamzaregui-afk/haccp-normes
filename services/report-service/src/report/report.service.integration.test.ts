/**
 * report.service.integration.test.ts
 *
 * Integration tests for ReportService against a real PostgreSQL database.
 *
 * Key invariants verified:
 *  1. Tenant isolation — reports from tenant-A are invisible to tenant-B.
 *  2. Status workflow: PENDING → UNDER_REVIEW → VALIDATED (sets validatedBy/At) → SENT.
 *  3. Deletion guard: only PENDING reports can be deleted.
 *  4. Stats: getStats() counts are correct and tenant-scoped.
 *  5. Filters: status and type filters applied in findAll.
 *  6. NotFoundException on cross-tenant access.
 *
 * Requires Docker — Testcontainers spins up postgres:15-alpine.
 * Run: pnpm --filter @haccp/report-service test:integration
 */

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { execSync } from 'child_process';
import * as path from 'path';
import { ReportService } from './report.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_A   = 'tenant-alpha';
const TENANT_B   = 'tenant-beta';
const VALIDATOR  = 'user-validator-001';

const REPORT_DTO = { type: 'MONTHLY_HYGIENE' };

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ReportService (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma:    PrismaClient;
  let service:   ReportService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:15-alpine')
      .withDatabase('haccp_reports_test')
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

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();

    const prismaService = {
      report: prisma.report,
      $transaction: prisma.$transaction.bind(prisma),
      $connect:     jest.fn(),
      $disconnect:  jest.fn(),
    } as unknown as PrismaService;

    service = new ReportService(prismaService);
  }, 120_000);

  afterEach(() => prisma.report.deleteMany());

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a PENDING report scoped to the tenant', async () => {
      const result = await service.create(REPORT_DTO, TENANT_A);
      expect(result.data.type).toBe('MONTHLY_HYGIENE');
      expect(result.data.status).toBe('PENDING');
      expect(result.data.tenantId).toBe(TENANT_A);
    });
  });

  // ── findAll — tenant isolation ─────────────────────────────────────────────

  describe('findAll — tenant isolation', () => {
    it('returns only reports for the requesting tenant', async () => {
      await service.create({ type: 'MONTHLY_HYGIENE'  }, TENANT_A);
      await service.create({ type: 'ANNUAL_HACCP' }, TENANT_B);

      const resultA = await service.findAll(TENANT_A, { page: 1, limit: 20 });
      const resultB = await service.findAll(TENANT_B, { page: 1, limit: 20 });

      expect(resultA.data).toHaveLength(1);
      expect(resultA.data[0].tenantId).toBe(TENANT_A);
      expect(resultB.data).toHaveLength(1);
      expect(resultB.data[0].tenantId).toBe(TENANT_B);
    });
  });

  // ── findAll — filters ──────────────────────────────────────────────────────

  describe('findAll — filters', () => {
    beforeEach(async () => {
      await service.create({ type: 'MONTHLY_HYGIENE' }, TENANT_A);
      const r = await service.create({ type: 'ANNUAL_HACCP' }, TENANT_A);
      // Advance one to UNDER_REVIEW
      await service.update(r.data.id, { status: 'UNDER_REVIEW' }, TENANT_A, VALIDATOR);
    });

    it('filters by status', async () => {
      const result = await service.findAll(TENANT_A, { page: 1, limit: 20, status: 'PENDING' });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe('PENDING');
    });

    it('filters by type', async () => {
      const result = await service.findAll(TENANT_A, { page: 1, limit: 20, type: 'ANNUAL_HACCP' });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe('ANNUAL_HACCP');
    });
  });

  // ── status workflow ────────────────────────────────────────────────────────

  describe('status workflow', () => {
    it('transitions PENDING → UNDER_REVIEW → VALIDATED → SENT', async () => {
      const created = await service.create(REPORT_DTO, TENANT_A);
      const id = created.data.id;

      await service.update(id, { status: 'UNDER_REVIEW' }, TENANT_A, VALIDATOR);
      const underReview = await service.findOne(id, TENANT_A);
      expect(underReview.data.status).toBe('UNDER_REVIEW');

      await service.update(id, { status: 'VALIDATED' }, TENANT_A, VALIDATOR);
      const validated = await service.findOne(id, TENANT_A);
      expect(validated.data.status).toBe('VALIDATED');
      expect(validated.data.validatedBy).toBe(VALIDATOR);
      expect(validated.data.validatedAt).not.toBeNull();

      await service.update(id, { status: 'SENT' }, TENANT_A, VALIDATOR);
      const sent = await service.findOne(id, TENANT_A);
      expect(sent.data.status).toBe('SENT');
      expect(sent.data.sentAt).not.toBeNull();
    });

    it('stores fileUrl when provided via update', async () => {
      const created = await service.create(REPORT_DTO, TENANT_A);
      const url = 'https://minio.haccp.internal/reports/report.pdf';

      await service.update(created.data.id, { fileUrl: url }, TENANT_A, VALIDATOR);
      const found = await service.findOne(created.data.id, TENANT_A);
      expect(found.data.fileUrl).toBe(url);
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes a PENDING report', async () => {
      const created = await service.create(REPORT_DTO, TENANT_A);
      await service.remove(created.data.id, TENANT_A);

      const raw = await prisma.report.findUnique({ where: { id: created.data.id } });
      expect(raw).toBeNull();
    });

    it('throws BadRequestException when report is not PENDING', async () => {
      const created = await service.create(REPORT_DTO, TENANT_A);
      await service.update(created.data.id, { status: 'UNDER_REVIEW' }, TENANT_A, VALIDATOR);

      await expect(service.remove(created.data.id, TENANT_A)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException on cross-tenant remove', async () => {
      const created = await service.create(REPORT_DTO, TENANT_A);
      await expect(service.remove(created.data.id, TENANT_B)).rejects.toThrow(NotFoundException);
    });
  });

  // ── getStats ───────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns accurate counts per status for the tenant', async () => {
      const r1 = await service.create({ type: 'MONTHLY_HYGIENE' }, TENANT_A);
      const r2 = await service.create({ type: 'ANNUAL_HACCP'    }, TENANT_A);
      const r3 = await service.create({ type: 'MONTHLY_HYGIENE' }, TENANT_A);

      await service.update(r2.data.id, { status: 'VALIDATED' }, TENANT_A, VALIDATOR);
      await service.update(r3.data.id, { status: 'SENT' },      TENANT_A, VALIDATOR);

      // Tenant B report — must NOT appear in Tenant A stats
      await service.create({ type: 'MONTHLY_HYGIENE' }, TENANT_B);

      const stats = await service.getStats(TENANT_A);
      expect(stats.data.total).toBe(3);
      expect(stats.data.pending).toBe(1); // r1
      expect(stats.data.validated).toBe(1); // r2
      expect(stats.data.sent).toBe(1);   // r3
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('throws NotFoundException for cross-tenant access', async () => {
      const created = await service.create(REPORT_DTO, TENANT_A);
      await expect(service.findOne(created.data.id, TENANT_B)).rejects.toThrow(NotFoundException);
    });
  });
});
