/**
 * Integration tests for nonconformity-service database layer.
 *
 * Spins up a real PostgreSQL 15 container via Testcontainers, applies
 * Prisma migrations against it, and exercises actual SQL queries.
 * Run with: pnpm --filter @haccp/nonconformity-service test:integration
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient, NCStatus, NCSeverity, NCCategory } from '@prisma/client';
import { execSync } from 'child_process';
import path from 'path';

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('NonconformityService — database layer (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;

  // ── Setup ──────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    // ARCH-DECISION: We pull postgres:15-alpine (same major version as prod) so
    // enum types and generated-column behaviour are identical to staging.
    container = await new PostgreSqlContainer('postgres:15-alpine')
      .withDatabase('haccp_nc_test')
      .withUsername('postgres')
      .withPassword('testpass')
      .start();

    const databaseUrl = container.getConnectionUri();
    process.env['DATABASE_URL'] = databaseUrl;

    // Apply migrations against the ephemeral DB. cwd must be the service root
    // so Prisma can find prisma/schema.prisma and prisma/migrations/.
    execSync('pnpm exec prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      cwd: path.resolve(__dirname, '../../..'), // services/nonconformity-service
      stdio: 'pipe',
    });

    prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
    });
    await prisma.$connect();
  }, 90_000);

  // ── Teardown ───────────────────────────────────────────────────────────────

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  // ── Between-test cleanup ───────────────────────────────────────────────────

  afterEach(async () => {
    // nc_photos references non_conformities via FK — truncate child first.
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "nc_photos" CASCADE`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "non_conformities" CASCADE`);
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Returns a minimal valid NonConformity data payload.
   * `siteId` and `reporterId` are required (NOT NULL) in the schema —
   * they are plain Strings with no FK enforced at DB level (cross-service
   * references are resolved at the application layer, not via DB joins).
   */
  function makeNcData(overrides: Partial<{
    reference:   string;
    tenantId:    string;
    siteId:      string;
    productId:   string | null;
    reporterId:  string;
    status:      NCStatus;
    severity:    NCSeverity;
    category:    NCCategory;
    description: string;
  }> = {}) {
    return {
      reference:   overrides.reference   ?? `NC-2026-${String(Math.random()).slice(2, 6)}`,
      tenantId:    overrides.tenantId    ?? 'tenant-default',
      siteId:      overrides.siteId      ?? 'site-001',
      productId:   overrides.productId   ?? null,
      reporterId:  overrides.reporterId  ?? 'user-reporter-001',
      status:      overrides.status      ?? NCStatus.OPEN,
      severity:    overrides.severity    ?? NCSeverity.MEDIUM,
      category:    overrides.category    ?? NCCategory.OTHER,
      description: overrides.description ?? 'Test non-conformity description',
    };
  }

  // ── Tests: Creation ─────────────────────────────────────────────────────────

  describe('NonConformity creation', () => {
    it('should create an NC with a fixed reference and return an auto-generated CUID id', async () => {
      const nc = await prisma.nonConformity.create({
        data: makeNcData({
          reference:   'NC-2025-0001',
          tenantId:    'tenant-abc',
          description: 'Frigo hors température',
          status:      NCStatus.OPEN,
          severity:    NCSeverity.HIGH,
          category:    NCCategory.TEMPERATURE,
          reporterId:  'user-001',
        }),
      });

      expect(nc.id).toBeDefined();
      expect(nc.id).toMatch(/^c.{24,}/); // CUID format
      expect(nc.reference).toBe('NC-2025-0001');
      expect(nc.status).toBe(NCStatus.OPEN);
      expect(nc.severity).toBe(NCSeverity.HIGH);
      expect(nc.category).toBe(NCCategory.TEMPERATURE);
      expect(nc.tenantId).toBe('tenant-abc');
      expect(nc.closedAt).toBeNull();
      expect(nc.closedById).toBeNull();
      expect(nc.createdAt).toBeInstanceOf(Date);
    });

    it('should apply schema defaults: status=OPEN, severity=MEDIUM, category=OTHER', async () => {
      const nc = await prisma.nonConformity.create({
        data: {
          reference:   'NC-DEFAULTS-0001',
          tenantId:    'tenant-def',
          siteId:      'site-001',
          reporterId:  'user-001',
          description: 'Testing defaults',
          // status, severity, category intentionally omitted
        },
      });

      expect(nc.status).toBe(NCStatus.OPEN);
      expect(nc.severity).toBe(NCSeverity.MEDIUM);
      expect(nc.category).toBe(NCCategory.OTHER);
    });

    it('should accept a null productId (optional FK to asset-service)', async () => {
      const nc = await prisma.nonConformity.create({
        data: makeNcData({ reference: 'NC-NULL-PRODUCT', productId: null }),
      });

      expect(nc.productId).toBeNull();
    });

    it('should store a correctiveAction when provided', async () => {
      const nc = await prisma.nonConformity.create({
        data: {
          ...makeNcData({ reference: 'NC-CA-0001' }),
          correctiveAction: 'Mise à la poubelle et nettoyage du frigo',
        },
      });

      expect(nc.correctiveAction).toBe('Mise à la poubelle et nettoyage du frigo');
    });
  });

  // ── Tests: Unique reference constraint ────────────────────────────────────

  describe('Unique reference constraint', () => {
    it('should reject a duplicate reference across tenants', async () => {
      await prisma.nonConformity.create({
        data: makeNcData({ reference: 'NC-DUP-0001', tenantId: 'tenant-x' }),
      });

      await expect(
        prisma.nonConformity.create({
          data: makeNcData({ reference: 'NC-DUP-0001', tenantId: 'tenant-y' }),
        }),
      ).rejects.toThrow();
    });
  });

  // ── Tests: Tenant isolation ────────────────────────────────────────────────

  describe('Tenant isolation (cross-tenant data leakage prevention)', () => {
    it('should scope findMany results to the queried tenantId', async () => {
      await prisma.nonConformity.createMany({
        data: [
          makeNcData({ reference: 'NC-T1-0001', tenantId: 'tenant-1' }),
          makeNcData({ reference: 'NC-T1-0002', tenantId: 'tenant-1' }),
          makeNcData({ reference: 'NC-T2-0001', tenantId: 'tenant-2' }),
        ],
      });

      const tenant1NCs = await prisma.nonConformity.findMany({ where: { tenantId: 'tenant-1' } });
      const tenant2NCs = await prisma.nonConformity.findMany({ where: { tenantId: 'tenant-2' } });

      expect(tenant1NCs).toHaveLength(2);
      expect(tenant2NCs).toHaveLength(1);
      expect(tenant2NCs[0]?.reference).toBe('NC-T2-0001');

      // Verify no cross-tenant leakage
      for (const nc of tenant1NCs) expect(nc.tenantId).toBe('tenant-1');
    });

    it('should return empty array for an unknown tenantId', async () => {
      await prisma.nonConformity.create({ data: makeNcData({ tenantId: 'tenant-known' }) });

      const result = await prisma.nonConformity.findMany({ where: { tenantId: 'tenant-ghost' } });
      expect(result).toHaveLength(0);
    });
  });

  // ── Tests: Status transitions ──────────────────────────────────────────────

  describe('Status transitions', () => {
    it('should update status from OPEN to IN_PROGRESS', async () => {
      const nc = await prisma.nonConformity.create({
        data: makeNcData({ reference: 'NC-STATUS-0001', status: NCStatus.OPEN }),
      });

      const updated = await prisma.nonConformity.update({
        where: { id: nc.id },
        data:  { status: NCStatus.IN_PROGRESS },
      });

      expect(updated.status).toBe(NCStatus.IN_PROGRESS);
    });

    it('should allow setting closedAt and closedById when transitioning to CLOSED', async () => {
      const nc = await prisma.nonConformity.create({
        data: makeNcData({ reference: 'NC-CLOSE-0001', status: NCStatus.OPEN }),
      });

      const closedAt  = new Date();
      const closedById = 'user-manager-001';

      const closed = await prisma.nonConformity.update({
        where: { id: nc.id },
        data: {
          status:    NCStatus.CLOSED,
          closedAt,
          closedById,
        },
      });

      expect(closed.status).toBe(NCStatus.CLOSED);
      expect(closed.closedAt).toBeInstanceOf(Date);
      // Allow for sub-millisecond DB rounding — compare within 1 second
      expect(Math.abs(closed.closedAt!.getTime() - closedAt.getTime())).toBeLessThan(1000);
      expect(closed.closedById).toBe(closedById);
    });

    it('should allow setting status to REJECTED', async () => {
      const nc = await prisma.nonConformity.create({
        data: makeNcData({ reference: 'NC-REJ-0001', status: NCStatus.OPEN }),
      });

      const rejected = await prisma.nonConformity.update({
        where: { id: nc.id },
        data: { status: NCStatus.REJECTED },
      });

      expect(rejected.status).toBe(NCStatus.REJECTED);
      // closedAt remains null — REJECTED is not a closure in the HACCP sense
      expect(rejected.closedAt).toBeNull();
    });

    it('should leave closedAt as null when status is not CLOSED', async () => {
      const nc = await prisma.nonConformity.create({
        data: makeNcData({ reference: 'NC-NOCLOSE-0001' }),
      });

      const updated = await prisma.nonConformity.update({
        where: { id: nc.id },
        data:  { status: NCStatus.IN_PROGRESS },
      });

      expect(updated.closedAt).toBeNull();
    });
  });

  // ── Tests: Filtering by status / severity ──────────────────────────────────

  describe('Filtering and counting', () => {
    it('should count critical open/in-progress NCs correctly', async () => {
      await prisma.nonConformity.createMany({
        data: [
          makeNcData({ reference: 'NC-C1', tenantId: 't1', severity: NCSeverity.CRITICAL, status: NCStatus.OPEN }),
          makeNcData({ reference: 'NC-C2', tenantId: 't1', severity: NCSeverity.CRITICAL, status: NCStatus.IN_PROGRESS }),
          makeNcData({ reference: 'NC-C3', tenantId: 't1', severity: NCSeverity.CRITICAL, status: NCStatus.CLOSED }),
          makeNcData({ reference: 'NC-L1', tenantId: 't1', severity: NCSeverity.LOW,      status: NCStatus.OPEN }),
        ],
      });

      // Mirrors the getStats logic in NonconformityService
      const criticalCount = await prisma.nonConformity.count({
        where: {
          tenantId: 't1',
          severity: NCSeverity.CRITICAL,
          status:   { in: [NCStatus.OPEN, NCStatus.IN_PROGRESS] },
        },
      });

      // NC-C1 and NC-C2 qualify; NC-C3 is CLOSED; NC-L1 is not CRITICAL
      expect(criticalCount).toBe(2);
    });

    it('should filter by severity=LOW', async () => {
      await prisma.nonConformity.createMany({
        data: [
          makeNcData({ reference: 'NC-SL1', tenantId: 'ts', severity: NCSeverity.LOW }),
          makeNcData({ reference: 'NC-SH1', tenantId: 'ts', severity: NCSeverity.HIGH }),
          makeNcData({ reference: 'NC-SM1', tenantId: 'ts', severity: NCSeverity.MEDIUM }),
        ],
      });

      const lowSeverityNCs = await prisma.nonConformity.findMany({
        where: { tenantId: 'ts', severity: NCSeverity.LOW },
      });

      expect(lowSeverityNCs).toHaveLength(1);
      expect(lowSeverityNCs[0]?.reference).toBe('NC-SL1');
    });

    it('should filter NCs by category', async () => {
      await prisma.nonConformity.createMany({
        data: [
          makeNcData({ reference: 'NC-TEMP-01', tenantId: 'tc', category: NCCategory.TEMPERATURE }),
          makeNcData({ reference: 'NC-HYG-01',  tenantId: 'tc', category: NCCategory.HYGIENE }),
          makeNcData({ reference: 'NC-TEMP-02', tenantId: 'tc', category: NCCategory.TEMPERATURE }),
        ],
      });

      const tempNCs = await prisma.nonConformity.findMany({
        where: { tenantId: 'tc', category: NCCategory.TEMPERATURE },
      });

      expect(tempNCs).toHaveLength(2);
    });

    it('should support combined tenantId + status filter', async () => {
      await prisma.nonConformity.createMany({
        data: [
          makeNcData({ reference: 'NC-F1', tenantId: 'tf', status: NCStatus.OPEN }),
          makeNcData({ reference: 'NC-F2', tenantId: 'tf', status: NCStatus.CLOSED }),
          makeNcData({ reference: 'NC-F3', tenantId: 'tf', status: NCStatus.OPEN }),
        ],
      });

      const openNCs = await prisma.nonConformity.findMany({
        where: { tenantId: 'tf', status: NCStatus.OPEN },
      });

      expect(openNCs).toHaveLength(2);
      for (const nc of openNCs) {
        expect(nc.status).toBe(NCStatus.OPEN);
        expect(nc.tenantId).toBe('tf');
      }
    });
  });

  // ── Tests: findFirst with compound where ──────────────────────────────────

  describe('findFirst with id + tenantId (service ownership check)', () => {
    it('should find an NC when both id and tenantId match', async () => {
      const nc = await prisma.nonConformity.create({
        data: makeNcData({ reference: 'NC-FF-0001', tenantId: 'tenant-owner' }),
      });

      const found = await prisma.nonConformity.findFirst({
        where: { id: nc.id, tenantId: 'tenant-owner' },
      });

      expect(found).not.toBeNull();
      expect(found?.id).toBe(nc.id);
    });

    it('should return null when tenantId does not match (cross-tenant guard)', async () => {
      const nc = await prisma.nonConformity.create({
        data: makeNcData({ reference: 'NC-GUARD-0001', tenantId: 'tenant-a' }),
      });

      // Querying with a different tenantId simulates a cross-tenant access attempt
      const result = await prisma.nonConformity.findFirst({
        where: { id: nc.id, tenantId: 'tenant-b' },
      });

      expect(result).toBeNull();
    });
  });

  // ── Tests: NCPhoto relation ────────────────────────────────────────────────

  describe('NCPhoto relation', () => {
    it('should attach photos to an NC and retrieve them via include', async () => {
      const nc = await prisma.nonConformity.create({
        data: makeNcData({ reference: 'NC-PHOTO-0001' }),
      });

      await prisma.nCPhoto.create({
        data: {
          nonConformityId: nc.id,
          url: 'https://minio.example.com/nc-photos/frigo-001.jpg',
        },
      });

      const ncWithPhotos = await prisma.nonConformity.findUnique({
        where:   { id: nc.id },
        include: { photos: true },
      });

      expect(ncWithPhotos?.photos).toHaveLength(1);
      expect(ncWithPhotos?.photos[0]?.url).toBe(
        'https://minio.example.com/nc-photos/frigo-001.jpg',
      );
    });

    it('should cascade-delete photos when the parent NC is deleted', async () => {
      const nc = await prisma.nonConformity.create({
        data: makeNcData({ reference: 'NC-CASC-0001' }),
      });

      const photo = await prisma.nCPhoto.create({
        data: {
          nonConformityId: nc.id,
          url: 'https://minio.example.com/nc-photos/orphan.jpg',
        },
      });

      await prisma.nonConformity.delete({ where: { id: nc.id } });

      const orphaned = await prisma.nCPhoto.findUnique({ where: { id: photo.id } });
      expect(orphaned).toBeNull();
    });
  });

  // ── Tests: Ordering ────────────────────────────────────────────────────────

  describe('Ordering', () => {
    it('should return NCs ordered by createdAt descending', async () => {
      // Insert in a known order, then verify the DB returns newest first.
      // Use sequential awaits (not createMany) to guarantee distinct createdAt values.
      const first  = await prisma.nonConformity.create({ data: makeNcData({ reference: 'NC-ORD-0001', tenantId: 'to' }) });
      const second = await prisma.nonConformity.create({ data: makeNcData({ reference: 'NC-ORD-0002', tenantId: 'to' }) });
      const third  = await prisma.nonConformity.create({ data: makeNcData({ reference: 'NC-ORD-0003', tenantId: 'to' }) });

      const results = await prisma.nonConformity.findMany({
        where:   { tenantId: 'to' },
        orderBy: { createdAt: 'desc' },
      });

      // The most recently created should come first
      expect(results[0]?.id).toBe(third.id);
      expect(results[1]?.id).toBe(second.id);
      expect(results[2]?.id).toBe(first.id);
    });
  });

  // ── Tests: Pagination helpers ──────────────────────────────────────────────

  describe('Pagination (skip / take)', () => {
    it('should return the correct page of results', async () => {
      // Insert 5 NCs for the same tenant
      const refs = ['NC-P-0001', 'NC-P-0002', 'NC-P-0003', 'NC-P-0004', 'NC-P-0005'];
      for (const reference of refs) {
        await prisma.nonConformity.create({ data: makeNcData({ reference, tenantId: 'tp' }) });
      }

      // Page 2 with limit 2 should return the 3rd and 4th oldest NCs
      const page2 = await prisma.nonConformity.findMany({
        where:   { tenantId: 'tp' },
        orderBy: { createdAt: 'asc' },
        skip:    2,
        take:    2,
      });

      expect(page2).toHaveLength(2);
      expect(page2[0]?.reference).toBe('NC-P-0003');
      expect(page2[1]?.reference).toBe('NC-P-0004');
    });

    it('should return total count independently of pagination window', async () => {
      const refs = ['NC-CNT-001', 'NC-CNT-002', 'NC-CNT-003'];
      await prisma.nonConformity.createMany({
        data: refs.map((reference) => makeNcData({ reference, tenantId: 'tc' })),
      });

      const total = await prisma.nonConformity.count({ where: { tenantId: 'tc' } });
      const page  = await prisma.nonConformity.findMany({
        where: { tenantId: 'tc' },
        skip:  0,
        take:  1,
      });

      expect(total).toBe(3);
      expect(page).toHaveLength(1); // window is smaller than total
    });
  });
}, 120_000);
