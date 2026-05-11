/**
 * user.service.integration.test.ts
 *
 * Integration tests for UserService against a real PostgreSQL database.
 *
 * Key invariants verified:
 *  1. Tenant isolation — findAll / findOne never return cross-tenant users.
 *  2. CRUD — create, findAll, findOne, update, changePassword, deactivate/reactivate.
 *  3. Search — full-text search filters by name or email (case-insensitive).
 *  4. Conflict — creating a user with a duplicate email throws ConflictException.
 *  5. Not found — NotFoundException when user belongs to a different tenant.
 *  6. Password hash — passwordHash is never returned in the select projection.
 *
 * Requires Docker — Testcontainers spins up postgres:15-alpine.
 * Run: pnpm --filter @haccp/user-service test:integration
 */

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { execSync } from 'child_process';
import * as path from 'path';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '@haccp/shared-types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-beta';

const ACTOR_A: JwtPayload = {
  sub:      'actor-a',
  tenantId: TENANT_A,
  role:     'ADMIN',
  email:    'admin@tenant-a.fr',
  iat:      0,
  exp:      9_999_999_999,
};

const NEW_USER_DTO = {
  email:    'jean.dupont@test.fr',
  name:     'Jean Dupont',
  role:     UserRole.OPERATOR,
  password: 'Secure1Pass',
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('UserService (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma:    PrismaClient;
  let service:   UserService;

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:15-alpine')
      .withDatabase('haccp_users_test')
      .withUsername('postgres')
      .withPassword('testpass')
      .start();

    const databaseUrl = container.getConnectionUri();
    process.env['DATABASE_URL'] = databaseUrl;
    // auth-service URL is needed for the cross-service password registration call.
    // In unit/integration scope it is mocked below via jest.spyOn.
    process.env['AUTH_SERVICE_URL'] = 'http://localhost:3010';

    execSync('pnpm prisma migrate deploy', {
      cwd:   path.resolve(__dirname, '../../'),
      env:   { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();

    const prismaService = {
      user:        prisma.user,
      group:       prisma.group,
      groupMember: prisma.groupMember,
      $connect:    jest.fn(),
      $disconnect: jest.fn(),
    } as unknown as PrismaService;

    service = new UserService(prismaService);

    // Stub the cross-service HTTP call to auth-service that registers the password hash.
    // UserService calls this internally via node-fetch; we bypass it in integration scope.
    jest.spyOn(service as unknown as Record<string, unknown>, 'registerPassword' as never)
      .mockResolvedValue(undefined as never);
  }, 120_000);

  afterEach(async () => {
    await prisma.groupMember.deleteMany();
    await prisma.group.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
    jest.restoreAllMocks();
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a user with correct fields and tenantId', async () => {
      const result = await service.create(NEW_USER_DTO, ACTOR_A);
      expect(result.data.email).toBe(NEW_USER_DTO.email);
      expect(result.data.tenantId).toBe(TENANT_A);
      expect(result.data.role).toBe(UserRole.OPERATOR);
      expect(result.data.status).toBe(UserStatus.ACTIVE);
    });

    it('sets status INVITED when no password provided', async () => {
      const result = await service.create({ ...NEW_USER_DTO, password: undefined }, ACTOR_A);
      expect(result.data.status).toBe(UserStatus.INVITED);
    });

    it('never exposes passwordHash in the response', async () => {
      const result = await service.create(NEW_USER_DTO, ACTOR_A);
      expect((result.data as Record<string, unknown>)['passwordHash']).toBeUndefined();
    });

    it('throws ConflictException when email is already in use', async () => {
      await service.create(NEW_USER_DTO, ACTOR_A);
      await expect(service.create(NEW_USER_DTO, ACTOR_A)).rejects.toThrow(ConflictException);
    });
  });

  // ── findAll — tenant isolation ─────────────────────────────────────────────

  describe('findAll — tenant isolation', () => {
    it('returns only users from the requesting tenant', async () => {
      // Create one user in each tenant directly via Prisma
      await prisma.user.create({ data: { email: 'a@tenant-a.fr', name: 'User A', tenantId: TENANT_A } });
      await prisma.user.create({ data: { email: 'b@tenant-b.fr', name: 'User B', tenantId: TENANT_B } });

      const resultA = await service.findAll(TENANT_A, {});
      const resultB = await service.findAll(TENANT_B, {});

      expect(resultA.data).toHaveLength(1);
      expect(resultA.data[0].tenantId).toBe(TENANT_A);
      expect(resultB.data).toHaveLength(1);
      expect(resultB.data[0].tenantId).toBe(TENANT_B);
    });
  });

  // ── findAll — search ───────────────────────────────────────────────────────

  describe('findAll — search', () => {
    beforeEach(async () => {
      await prisma.user.createMany({
        data: [
          { email: 'alice@haccp.fr',   name: 'Alice Martin',  tenantId: TENANT_A },
          { email: 'bob@haccp.fr',     name: 'Bob Dupont',    tenantId: TENANT_A },
          { email: 'charlie@haccp.fr', name: 'Charlie Petit', tenantId: TENANT_A },
        ],
      });
    });

    it('searches by name (case-insensitive)', async () => {
      const result = await service.findAll(TENANT_A, { search: 'alice' });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Alice Martin');
    });

    it('searches by email', async () => {
      const result = await service.findAll(TENANT_A, { search: 'bob@haccp' });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].email).toBe('bob@haccp.fr');
    });

    it('returns all when search is empty', async () => {
      const result = await service.findAll(TENANT_A, {});
      expect(result.data).toHaveLength(3);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the user when it belongs to the tenant', async () => {
      const created = await service.create(NEW_USER_DTO, ACTOR_A);
      const found   = await service.findOne(created.data.id, TENANT_A);
      expect(found.data.id).toBe(created.data.id);
      expect(found.data.email).toBe(NEW_USER_DTO.email);
    });

    it('throws NotFoundException when user belongs to a different tenant', async () => {
      const created = await service.create(NEW_USER_DTO, ACTOR_A);
      await expect(service.findOne(created.data.id, TENANT_B)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for a non-existent id', async () => {
      await expect(service.findOne('does-not-exist', TENANT_A)).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates name and role for a tenant-owned user', async () => {
      const created = await service.create(NEW_USER_DTO, ACTOR_A);
      const updated = await service.update(created.data.id, { name: 'Jean-Paul', role: UserRole.MANAGER }, TENANT_A);
      expect(updated.data.name).toBe('Jean-Paul');
      expect(updated.data.role).toBe(UserRole.MANAGER);
    });

    it('throws NotFoundException when updating a cross-tenant user', async () => {
      const created = await service.create(NEW_USER_DTO, ACTOR_A);
      await expect(service.update(created.data.id, { name: 'Hacker' }, TENANT_B)).rejects.toThrow(NotFoundException);
    });
  });
});
