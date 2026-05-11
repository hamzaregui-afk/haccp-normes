/**
 * tenant.service.integration.test.ts
 *
 * Integration tests for TenantService against a real PostgreSQL database.
 *
 * Key invariants verified:
 *  1. CRUD: create, findAll, findOne, update, remove (soft-delete → ARCHIVED).
 *  2. Slug uniqueness: ConflictException on duplicate slug.
 *  3. Search: case-insensitive filter by name or slug.
 *  4. Soft-delete: record remains in DB with status=ARCHIVED; not truly deleted.
 *  5. NotFoundException: findOne / update / remove on non-existent id.
 *  6. Site count: included in findAll via _count relation.
 *
 * Requires Docker — Testcontainers spins up postgres:15-alpine.
 * Run: pnpm --filter @haccp/tenant-service test:integration
 */

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { execSync } from 'child_process';
import * as path from 'path';
import { TenantService } from './tenant.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_DTO = {
  name: 'Restaurant du Port',
  slug: 'restaurant-du-port',
  plan: 'standard',
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('TenantService (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma:    PrismaClient;
  let service:   TenantService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:15-alpine')
      .withDatabase('haccp_tenants_test')
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
      tenant:      prisma.tenant,
      site:        prisma.site,
      zone:        prisma.zone,
      $connect:    jest.fn(),
      $disconnect: jest.fn(),
    } as unknown as PrismaService;

    service = new TenantService(prismaService);
  }, 120_000);

  afterEach(async () => {
    await prisma.zone.deleteMany();
    await prisma.site.deleteMany();
    await prisma.tenant.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a tenant with ACTIVE status and correct fields', async () => {
      const result = await service.create(TENANT_DTO);
      expect(result.data.name).toBe('Restaurant du Port');
      expect(result.data.slug).toBe('restaurant-du-port');
      expect(result.data.status).toBe('ACTIVE');
      expect(result.data.plan).toBe('standard');
    });

    it('throws ConflictException for duplicate slug', async () => {
      await service.create(TENANT_DTO);
      await expect(service.create(TENANT_DTO)).rejects.toThrow(ConflictException);
    });

    it('allows two tenants with different slugs', async () => {
      await service.create(TENANT_DTO);
      const result = await service.create({ ...TENANT_DTO, slug: 'autre-resto', name: 'Autre Restaurant' });
      expect(result.data.slug).toBe('autre-resto');
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    beforeEach(async () => {
      await service.create({ name: 'Alpha Boulangerie',  slug: 'alpha-boulangerie'  });
      await service.create({ name: 'Beta Brasserie',     slug: 'beta-brasserie'     });
      await service.create({ name: 'Gamma Traiteur',     slug: 'gamma-traiteur'     });
    });

    it('returns all tenants with pagination meta', async () => {
      const result = await service.findAll(1, 20);
      expect(result.data).toHaveLength(3);
      expect(result.meta?.total).toBe(3);
    });

    it('respects page limit', async () => {
      const result = await service.findAll(1, 2);
      expect(result.data).toHaveLength(2);
      expect(result.meta?.total).toBe(3);
    });

    it('searches by name (case-insensitive)', async () => {
      const result = await service.findAll(1, 20, 'boulangerie');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Alpha Boulangerie');
    });

    it('searches by slug', async () => {
      const result = await service.findAll(1, 20, 'gamma-traiteur');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].slug).toBe('gamma-traiteur');
    });

    it('includes site count via _count', async () => {
      const created = await service.create({ name: 'Resto Sites', slug: 'resto-sites' });
      await prisma.site.create({ data: { name: 'Site A', tenantId: created.data.id } });
      await prisma.site.create({ data: { name: 'Site B', tenantId: created.data.id } });

      const list = await service.findAll(1, 20, 'resto-sites');
      expect(list.data[0]._count?.sites).toBe(2);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the tenant with sites and zones', async () => {
      const created = await service.create(TENANT_DTO);
      const found   = await service.findOne(created.data.id);
      expect(found.data.id).toBe(created.data.id);
      expect(found.data.sites).toBeDefined();
    });

    it('throws NotFoundException for a non-existent id', async () => {
      await expect(service.findOne('no-such-tenant')).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates tenant name and plan', async () => {
      const created = await service.create(TENANT_DTO);
      const updated = await service.update(created.data.id, { name: 'Nouveau Nom', plan: 'premium' });
      expect(updated.data.name).toBe('Nouveau Nom');
      expect(updated.data.plan).toBe('premium');
    });

    it('throws NotFoundException for a non-existent id', async () => {
      await expect(service.update('no-such-id', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove (soft-delete) ────────────────────────────────────────────────────

  describe('remove (soft-delete)', () => {
    it('sets status to ARCHIVED instead of deleting', async () => {
      const created = await service.create(TENANT_DTO);
      await service.remove(created.data.id);

      const raw = await prisma.tenant.findUnique({ where: { id: created.data.id } });
      expect(raw).not.toBeNull();
      expect(raw?.status).toBe('ARCHIVED');
    });

    it('throws NotFoundException for a non-existent id', async () => {
      await expect(service.remove('no-such-id')).rejects.toThrow(NotFoundException);
    });
  });
});
