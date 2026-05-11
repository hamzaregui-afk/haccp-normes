/**
 * dlc.service.integration.test.ts
 *
 * Integration tests for DlcService against a real PostgreSQL database.
 *
 * Key invariants verified:
 *  1. calculate() — pure function, no DB write, correct expiry computation.
 *  2. printLabel() — persists label with correct expiresAt calculation.
 *  3. Tenant isolation — labels from tenant-A invisible to tenant-B.
 *  4. Filters — productId, printedBy, date-range.
 *  5. NotFoundException — findOne on cross-tenant or non-existent label.
 *  6. Lot number — optional field stored and retrieved correctly.
 *
 * Requires Docker — Testcontainers spins up postgres:15-alpine.
 * Run: pnpm --filter @haccp/dlc-service test:integration
 */

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { execSync } from 'child_process';
import * as path from 'path';
import { DlcService } from './dlc.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_A  = 'tenant-alpha';
const TENANT_B  = 'tenant-beta';
const USER_A    = 'operator-001';
const USER_B    = 'operator-002';
const PRODUCT_A = 'product-poulet';
const PRODUCT_B = 'product-steak';

function makeLabel(overrides: Record<string, unknown> = {}) {
  return {
    productId:   PRODUCT_A,
    productName: 'Poulet rôti',
    dlcDays:     3,
    producedAt:  new Date('2026-05-10T08:00:00.000Z'),
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('DlcService (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma:    PrismaClient;
  let service:   DlcService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:15-alpine')
      .withDatabase('haccp_dlc_test')
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
      dlcLabel:    prisma.dlcLabel,
      $connect:    jest.fn(),
      $disconnect: jest.fn(),
    } as unknown as PrismaService;

    service = new DlcService(prismaService);
  }, 120_000);

  afterEach(() => prisma.dlcLabel.deleteMany());

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  // ── calculate (pure — no DB) ───────────────────────────────────────────────

  describe('calculate', () => {
    it('returns the correct expiresAt without writing to the DB', async () => {
      const dto = {
        productId:   PRODUCT_A,
        productName: 'Poulet rôti',
        dlcDays:     3,
        producedAt:  new Date('2026-05-10T00:00:00.000Z'),
      };

      const result = service.calculate(dto);

      expect(result.data.expiresAt.toISOString()).toBe('2026-05-13T00:00:00.000Z');
      // No DB row should have been created
      const count = await prisma.dlcLabel.count();
      expect(count).toBe(0);
    });

    it('echoes productId and productName through', () => {
      const dto = { productId: PRODUCT_A, productName: 'Salade', dlcDays: 1, producedAt: new Date() };
      const result = service.calculate(dto);
      expect(result.data.productId).toBe(PRODUCT_A);
      expect(result.data.productName).toBe('Salade');
    });
  });

  // ── printLabel ─────────────────────────────────────────────────────────────

  describe('printLabel', () => {
    it('persists the label and computes expiresAt from producedAt + dlcDays', async () => {
      const dto = makeLabel();
      const result = await service.printLabel(dto, TENANT_A, USER_A);

      expect(result.data.tenantId).toBe(TENANT_A);
      expect(result.data.printedBy).toBe(USER_A);
      // 2026-05-10 + 3 days = 2026-05-13
      expect(new Date(result.data.expiresAt).toISOString()).toBe('2026-05-13T08:00:00.000Z');
    });

    it('uses provided expiresAt when present (overrides calculation)', async () => {
      const customExpiry = new Date('2026-06-01T00:00:00.000Z');
      const dto = { ...makeLabel(), expiresAt: customExpiry };
      const result = await service.printLabel(dto, TENANT_A, USER_A);
      expect(new Date(result.data.expiresAt).toISOString()).toBe(customExpiry.toISOString());
    });

    it('stores optional lotNumber', async () => {
      const dto = { ...makeLabel(), lotNumber: 'LOT-2026-001' };
      const result = await service.printLabel(dto, TENANT_A, USER_A);
      expect(result.data.lotNumber).toBe('LOT-2026-001');
    });

    it('stores null lotNumber when not provided', async () => {
      const result = await service.printLabel(makeLabel(), TENANT_A, USER_A);
      expect(result.data.lotNumber).toBeNull();
    });
  });

  // ── findAll — tenant isolation ─────────────────────────────────────────────

  describe('findAll — tenant isolation', () => {
    it('returns only labels belonging to the requesting tenant', async () => {
      await service.printLabel(makeLabel(), TENANT_A, USER_A);
      await service.printLabel(makeLabel(), TENANT_B, USER_B);

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
      await service.printLabel(makeLabel({ productId: PRODUCT_A }), TENANT_A, USER_A);
      await service.printLabel(makeLabel({ productId: PRODUCT_B, productName: 'Steak' }), TENANT_A, USER_A);
      await service.printLabel(makeLabel({ productId: PRODUCT_A }), TENANT_A, USER_B);
    });

    it('filters by productId', async () => {
      const result = await service.findAll(TENANT_A, { page: 1, limit: 20, productId: PRODUCT_B });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].productName).toBe('Steak');
    });

    it('filters by printedBy', async () => {
      const result = await service.findAll(TENANT_A, { page: 1, limit: 20, printedBy: USER_B });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].printedBy).toBe(USER_B);
    });

    it('date-range filter excludes labels printed before from-date', async () => {
      const futureFrom = new Date(Date.now() + 60_000);
      const result = await service.findAll(TENANT_A, { page: 1, limit: 20, from: futureFrom });
      expect(result.data).toHaveLength(0);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the label when it belongs to the tenant', async () => {
      const created = await service.printLabel(makeLabel(), TENANT_A, USER_A);
      const found   = await service.findOne(created.data.id, TENANT_A);
      expect(found.data.id).toBe(created.data.id);
    });

    it('throws NotFoundException for cross-tenant access', async () => {
      const created = await service.printLabel(makeLabel(), TENANT_A, USER_A);
      await expect(service.findOne(created.data.id, TENANT_B)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for a non-existent id', async () => {
      await expect(service.findOne('no-such-label', TENANT_A)).rejects.toThrow(NotFoundException);
    });
  });
});
