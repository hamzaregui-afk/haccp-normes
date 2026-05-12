/**
 * Integration tests for auth-service database layer.
 *
 * Spins up a real PostgreSQL 15 container via Testcontainers, applies
 * Prisma migrations against it, and exercises actual SQL queries.
 * Run with: pnpm --filter @haccp/auth-service test:integration
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { execSync } from 'child_process';
import path from 'path';

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('AuthService — database layer (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;

  // ── Setup ──────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    // ARCH-DECISION: We pull postgres:15-alpine (same major version as prod) so
    // enum types and generated-column behaviour are identical to staging.
    container = await new PostgreSqlContainer('postgres:15-alpine')
      .withDatabase('haccp_auth_test')
      .withUsername('postgres')
      .withPassword('testpass')
      .start();

    const databaseUrl = container.getConnectionUri();
    process.env['DATABASE_URL'] = databaseUrl;

    // Apply migrations against the ephemeral DB. cwd must be the service root
    // so Prisma can find prisma/schema.prisma and prisma/migrations/.
    execSync('pnpm exec prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      cwd: path.resolve(__dirname, '../../..'), // services/auth-service
      stdio: 'pipe',
    });

    prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
    });
    await prisma.$connect();
  }, 90_000); // container pull + start can take up to 90 s on first run

  // ── Teardown ───────────────────────────────────────────────────────────────

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  // ── Between-test cleanup ───────────────────────────────────────────────────

  afterEach(async () => {
    // Truncate in FK-safe order: child tables first, then parents.
    // refresh_tokens references users via CASCADE, so order matters.
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "refresh_tokens" CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "users" CASCADE`);
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Minimal valid User payload — override only the fields under test.
   * `name` is required by the schema (NOT NULL), so we always include it.
   */
  function makeUserData(overrides: Partial<{
    email: string;
    name: string;
    passwordHash: string;
    role: UserRole;
    status: UserStatus;
    tenantId: string;
  }> = {}) {
    return {
      email:        overrides.email        ?? 'default@example.com',
      name:         overrides.name         ?? 'Test User',
      passwordHash: overrides.passwordHash ?? '$2b$10$hashedpasswordexample',
      role:         overrides.role         ?? UserRole.OPERATOR,
      status:       overrides.status       ?? UserStatus.ACTIVE,
      tenantId:     overrides.tenantId     ?? 'tenant-default-001',
    };
  }

  // ── Tests: User CRUD ────────────────────────────────────────────────────────

  describe('User creation', () => {
    it('should persist a user and return an auto-generated CUID id', async () => {
      const user = await prisma.user.create({
        data: makeUserData({
          email:    'create@example.com',
          name:     'Alice Dupont',
          role:     UserRole.ADMIN,
          tenantId: 'tenant-test-001',
        }),
      });

      expect(user.id).toBeDefined();
      // CUID starts with 'c' and is at least 25 chars
      expect(user.id).toMatch(/^c.{24,}/);
      expect(user.email).toBe('create@example.com');
      expect(user.name).toBe('Alice Dupont');
      expect(user.role).toBe(UserRole.ADMIN);
      expect(user.status).toBe(UserStatus.ACTIVE); // default from schema
      expect(user.tenantId).toBe('tenant-test-001');
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('should apply schema defaults: role=OPERATOR, status=ACTIVE', async () => {
      const user = await prisma.user.create({
        data: {
          email:        'defaults@example.com',
          name:         'Default User',
          passwordHash: 'hash',
          tenantId:     'tenant-defaults',
          // role and status intentionally omitted — rely on schema defaults
        },
      });

      expect(user.role).toBe(UserRole.OPERATOR);
      expect(user.status).toBe(UserStatus.ACTIVE);
    });
  });

  // ── Tests: Unique constraint ────────────────────────────────────────────────

  describe('Unique email constraint', () => {
    it('should reject a duplicate email with a Prisma unique violation error', async () => {
      await prisma.user.create({
        data: makeUserData({ email: 'dup@example.com', tenantId: 't1' }),
      });

      // Second insert with same email must throw regardless of tenantId
      await expect(
        prisma.user.create({
          data: makeUserData({ email: 'dup@example.com', tenantId: 't2' }),
        }),
      ).rejects.toThrow();
    });

    it('should allow the same email for different rows only if re-inserted after deletion', async () => {
      const data = makeUserData({ email: 'reuse@example.com', tenantId: 't1' });
      const first = await prisma.user.create({ data });
      await prisma.user.delete({ where: { id: first.id } });

      // After deletion the email slot is free again
      const second = await prisma.user.create({ data });
      expect(second.email).toBe('reuse@example.com');
      expect(second.id).not.toBe(first.id);
    });
  });

  // ── Tests: findUnique by email ──────────────────────────────────────────────

  describe('findUnique by email', () => {
    it('should retrieve a user by email', async () => {
      await prisma.user.create({
        data: makeUserData({ email: 'findme@example.com', role: UserRole.MANAGER }),
      });

      const found = await prisma.user.findUnique({ where: { email: 'findme@example.com' } });

      expect(found).not.toBeNull();
      expect(found?.email).toBe('findme@example.com');
      expect(found?.role).toBe(UserRole.MANAGER);
    });

    it('should return null for a non-existent email', async () => {
      const result = await prisma.user.findUnique({ where: { email: 'ghost@example.com' } });
      expect(result).toBeNull();
    });
  });

  // ── Tests: Tenant isolation ────────────────────────────────────────────────

  describe('Tenant isolation', () => {
    it('should scope findMany results to a single tenantId', async () => {
      await prisma.user.createMany({
        data: [
          makeUserData({ email: 'a@tenant1.com', tenantId: 'tenant-1' }),
          makeUserData({ email: 'b@tenant1.com', tenantId: 'tenant-1' }),
          makeUserData({ email: 'c@tenant2.com', tenantId: 'tenant-2' }),
        ],
      });

      const tenant1Users = await prisma.user.findMany({ where: { tenantId: 'tenant-1' } });
      const tenant2Users = await prisma.user.findMany({ where: { tenantId: 'tenant-2' } });

      expect(tenant1Users).toHaveLength(2);
      expect(tenant2Users).toHaveLength(1);
      // Every result belongs to the correct tenant
      for (const u of tenant1Users) expect(u.tenantId).toBe('tenant-1');
      for (const u of tenant2Users) expect(u.tenantId).toBe('tenant-2');
    });

    it('should return empty array when tenantId matches no users', async () => {
      await prisma.user.create({ data: makeUserData({ tenantId: 'tenant-exists' }) });

      const result = await prisma.user.findMany({ where: { tenantId: 'tenant-void' } });
      expect(result).toHaveLength(0);
    });
  });

  // ── Tests: Status filtering ────────────────────────────────────────────────

  describe('Status filtering', () => {
    it('should filter users by INACTIVE status', async () => {
      await prisma.user.createMany({
        data: [
          makeUserData({ email: 'active@t.com',   status: UserStatus.ACTIVE,   tenantId: 't' }),
          makeUserData({ email: 'inactive@t.com', status: UserStatus.INACTIVE, tenantId: 't' }),
          makeUserData({ email: 'invited@t.com',  status: UserStatus.INVITED,  tenantId: 't' }),
        ],
      });

      const inactive = await prisma.user.findMany({
        where: { tenantId: 't', status: UserStatus.INACTIVE },
      });

      expect(inactive).toHaveLength(1);
      expect(inactive[0]?.email).toBe('inactive@t.com');
    });

    it('should support filtering by role within a tenant', async () => {
      await prisma.user.createMany({
        data: [
          makeUserData({ email: 'admin@t.com',   role: UserRole.ADMIN,   tenantId: 't-roles' }),
          makeUserData({ email: 'mgr@t.com',     role: UserRole.MANAGER, tenantId: 't-roles' }),
          makeUserData({ email: 'op1@t.com',     role: UserRole.OPERATOR,tenantId: 't-roles' }),
          makeUserData({ email: 'op2@t.com',     role: UserRole.OPERATOR,tenantId: 't-roles' }),
        ],
      });

      const operators = await prisma.user.findMany({
        where: { tenantId: 't-roles', role: UserRole.OPERATOR },
      });

      expect(operators).toHaveLength(2);
    });
  });

  // ── Tests: RefreshToken relation ───────────────────────────────────────────

  describe('RefreshToken', () => {
    it('should create a refresh token linked to a user', async () => {
      const user = await prisma.user.create({
        data: makeUserData({ email: 'token@example.com' }),
      });

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 days
      const token = await prisma.refreshToken.create({
        data: {
          userId:    user.id,
          token:     'refresh-token-value-abc123',
          expiresAt,
        },
      });

      expect(token.id).toBeDefined();
      expect(token.userId).toBe(user.id);
      expect(token.token).toBe('refresh-token-value-abc123');
    });

    it('should cascade-delete refresh tokens when the parent user is deleted', async () => {
      const user = await prisma.user.create({
        data: makeUserData({ email: 'cascade@example.com' }),
      });

      await prisma.refreshToken.create({
        data: {
          userId:    user.id,
          token:     'token-to-cascade',
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });

      // Delete the user — FK CASCADE should remove the token too
      await prisma.user.delete({ where: { id: user.id } });

      const orphaned = await prisma.refreshToken.findMany({ where: { userId: user.id } });
      expect(orphaned).toHaveLength(0);
    });

    it('should enforce unique token constraint', async () => {
      const user = await prisma.user.create({
        data: makeUserData({ email: 'uniquetoken@example.com' }),
      });

      const sharedToken = 'same-refresh-token-xyz';
      await prisma.refreshToken.create({
        data: { userId: user.id, token: sharedToken, expiresAt: new Date(Date.now() + 3600_000) },
      });

      await expect(
        prisma.refreshToken.create({
          data: { userId: user.id, token: sharedToken, expiresAt: new Date(Date.now() + 3600_000) },
        }),
      ).rejects.toThrow();
    });
  });

  // ── Tests: Update ──────────────────────────────────────────────────────────

  describe('User update', () => {
    it('should update the user status and bump updatedAt', async () => {
      const user = await prisma.user.create({
        data: makeUserData({ email: 'update@example.com', status: UserStatus.ACTIVE }),
      });

      // Ensure a measurable time difference for updatedAt
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await prisma.user.update({
        where: { id: user.id },
        data:  { status: UserStatus.INACTIVE },
      });

      expect(updated.status).toBe(UserStatus.INACTIVE);
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(user.updatedAt.getTime());
    });

    it('should allow promoting a user to SUPER_ADMIN role', async () => {
      const user = await prisma.user.create({
        data: makeUserData({ email: 'promote@example.com', role: UserRole.OPERATOR }),
      });

      const promoted = await prisma.user.update({
        where: { id: user.id },
        data:  { role: UserRole.SUPER_ADMIN },
      });

      expect(promoted.role).toBe(UserRole.SUPER_ADMIN);
    });
  });
}, 120_000);
