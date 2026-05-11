/**
 * product.service.integration.test.ts
 *
 * Integration tests for ProductService against a real PostgreSQL database.
 *
 * Key invariants verified:
 *  1. Tenant isolation — products from tenant-A are invisible to tenant-B.
 *  2. CRUD — create, findAll, findOne, update, soft-delete (isActive=false).
 *  3. Search and category filter.
 *  4. Supplier join — supplier name/code included in findAll results.
 *  5. Conflict — duplicate (code, tenantId) pair throws ConflictException.
 *  6. NotFoundException — update/findOne on cross-tenant record is blocked.
 *
 * Requires Docker — Testcontainers spins up postgres:15-alpine.
 * Run: pnpm --filter @haccp/asset-service test:integration
 */

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { execSync } from 'child_process';
import * as path from 'path';
import { ProductService } from './product.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-beta';

const PRODUCT_DTO = {
  code:     'P-001',
  name:     'Poulet rôti',
  category: 'Viandes',
  dlcDays:  3,
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ProductService (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma:    PrismaClient;
  let service:   ProductService;

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:15-alpine')
      .withDatabase('haccp_assets_test')
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
      product:  prisma.product,
      supplier: prisma.supplier,
      $connect:    jest.fn(),
      $disconnect: jest.fn(),
    } as unknown as PrismaService;

    service = new ProductService(prismaService);
  }, 120_000);

  afterEach(async () => {
    await prisma.product.deleteMany();
    await prisma.supplier.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('persists a product with correct tenantId', async () => {
      const result = await service.create(PRODUCT_DTO, TENANT_A);
      expect(result.data.name).toBe('Poulet rôti');
      expect(result.data.tenantId).toBe(TENANT_A);
      expect(result.data.isActive).toBe(true);
    });

    it('throws ConflictException for duplicate code within same tenant', async () => {
      await service.create(PRODUCT_DTO, TENANT_A);
      await expect(service.create(PRODUCT_DTO, TENANT_A)).rejects.toThrow(ConflictException);
    });

    it('allows same code in different tenants', async () => {
      await service.create(PRODUCT_DTO, TENANT_A);
      const result = await service.create(PRODUCT_DTO, TENANT_B);
      expect(result.data.code).toBe('P-001');
      expect(result.data.tenantId).toBe(TENANT_B);
    });
  });

  // ── findAll — tenant isolation ─────────────────────────────────────────────

  describe('findAll — tenant isolation', () => {
    it('returns only products for the requesting tenant', async () => {
      await service.create({ ...PRODUCT_DTO, code: 'PA-1' }, TENANT_A);
      await service.create({ ...PRODUCT_DTO, code: 'PB-1' }, TENANT_B);

      const resultA = await service.findAll(TENANT_A, { page: 1, limit: 20 });
      const resultB = await service.findAll(TENANT_B, { page: 1, limit: 20 });

      expect(resultA.data).toHaveLength(1);
      expect(resultA.data[0].tenantId).toBe(TENANT_A);
      expect(resultB.data).toHaveLength(1);
      expect(resultB.data[0].tenantId).toBe(TENANT_B);
    });

    it('excludes inactive products by default', async () => {
      const created = await service.create(PRODUCT_DTO, TENANT_A);
      await service.remove(created.data.id, TENANT_A); // soft-delete → isActive=false

      const result = await service.findAll(TENANT_A, { page: 1, limit: 20 });
      expect(result.data).toHaveLength(0);
    });
  });

  // ── findAll — search ───────────────────────────────────────────────────────

  describe('findAll — search and category filter', () => {
    beforeEach(async () => {
      await service.create({ code: 'P1', name: 'Poulet rôti',    category: 'Viandes'  }, TENANT_A);
      await service.create({ code: 'P2', name: 'Salade verte',   category: 'Légumes'  }, TENANT_A);
      await service.create({ code: 'P3', name: 'Steak haché',    category: 'Viandes'  }, TENANT_A);
    });

    it('filters by name search (case-insensitive)', async () => {
      const result = await service.findAll(TENANT_A, { page: 1, limit: 20, search: 'poulet' });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Poulet rôti');
    });

    it('filters by category', async () => {
      const result = await service.findAll(TENANT_A, { page: 1, limit: 20, category: 'Viandes' });
      expect(result.data).toHaveLength(2);
      expect(result.data.every((p) => p.category === 'Viandes')).toBe(true);
    });

    it('returns distinct categories', async () => {
      const categories = await service.findCategories(TENANT_A);
      expect(categories).toContain('Viandes');
      expect(categories).toContain('Légumes');
      expect(categories).toHaveLength(2);
    });
  });

  // ── findAll — pagination ───────────────────────────────────────────────────

  describe('findAll — pagination', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 5; i++) {
        await service.create({ code: `P${i}`, name: `Product ${i}`, category: 'Test' }, TENANT_A);
      }
    });

    it('returns correct page size', async () => {
      const result = await service.findAll(TENANT_A, { page: 1, limit: 2 });
      expect(result.data).toHaveLength(2);
      expect(result.meta?.total).toBe(5);
    });

    it('page 2 returns different records than page 1', async () => {
      const page1 = await service.findAll(TENANT_A, { page: 1, limit: 2 });
      const page2 = await service.findAll(TENANT_A, { page: 2, limit: 2 });
      const ids1  = page1.data.map((p) => p.id);
      const ids2  = page2.data.map((p) => p.id);
      expect(ids1.some((id) => ids2.includes(id))).toBe(false);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the product when it belongs to the tenant', async () => {
      const created = await service.create(PRODUCT_DTO, TENANT_A);
      const found   = await service.findOne(created.data.id, TENANT_A);
      expect(found.data.id).toBe(created.data.id);
    });

    it('throws NotFoundException for cross-tenant access', async () => {
      const created = await service.create(PRODUCT_DTO, TENANT_A);
      await expect(service.findOne(created.data.id, TENANT_B)).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates product fields', async () => {
      const created = await service.create(PRODUCT_DTO, TENANT_A);
      const updated = await service.update(created.data.id, { name: 'Poulet grillé', dlcDays: 5 }, TENANT_A);
      expect(updated.data.name).toBe('Poulet grillé');
      expect(updated.data.dlcDays).toBe(5);
    });

    it('throws NotFoundException on cross-tenant update', async () => {
      const created = await service.create(PRODUCT_DTO, TENANT_A);
      await expect(service.update(created.data.id, { name: 'Hacked' }, TENANT_B)).rejects.toThrow(NotFoundException);
    });
  });

  // ── soft delete ────────────────────────────────────────────────────────────

  describe('remove (soft delete)', () => {
    it('sets isActive to false instead of deleting the record', async () => {
      const created = await service.create(PRODUCT_DTO, TENANT_A);
      await service.remove(created.data.id, TENANT_A);

      const raw = await prisma.product.findUnique({ where: { id: created.data.id } });
      expect(raw).not.toBeNull();
      expect(raw?.isActive).toBe(false);
    });

    it('throws NotFoundException on cross-tenant remove', async () => {
      const created = await service.create(PRODUCT_DTO, TENANT_A);
      await expect(service.remove(created.data.id, TENANT_B)).rejects.toThrow(NotFoundException);
    });
  });

  // ── supplier join ──────────────────────────────────────────────────────────

  describe('supplier join', () => {
    it('includes supplier name in findAll results when supplierId is set', async () => {
      const supplier = await prisma.supplier.create({
        data: { code: 'SUP-1', name: 'Fournisseur Alpha', tenantId: TENANT_A },
      });
      await service.create({ ...PRODUCT_DTO, supplierId: supplier.id }, TENANT_A);

      const result = await service.findAll(TENANT_A, { page: 1, limit: 20 });
      expect(result.data[0].supplier?.name).toBe('Fournisseur Alpha');
    });
  });
});
