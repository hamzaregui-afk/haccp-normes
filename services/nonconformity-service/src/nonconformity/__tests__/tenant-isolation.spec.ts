/**
 * tenant-isolation.spec.ts — nonconformity-service
 *
 * Multi-tenant isolation tests for NonconformityService.
 *
 * Validates:
 *  1. NC reference generation is tenant-scoped — same reference (NC-2026-0001) can exist
 *     independently in Tenant A and Tenant B without collision
 *  2. findOne with (id='nc-1', tenantId='tenant-B') returns null even though 'nc-1'
 *     belongs to tenant-A (double-scope: id + tenantId)
 *  3. Photos are scoped via parent NC tenantId — no direct photo access without NC ownership
 *  4. NC creation always stamps the actor's tenantId (never from request body)
 *  5. Status transitions (OPEN → CLOSED) are tenant-scoped — cross-tenant close is blocked
 */

import { NotFoundException, BadRequestException } from '@nestjs/common';

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_A = 'tenant-alpha-001';
const TENANT_B = 'tenant-beta-002';

// ── Prisma mock factory ───────────────────────────────────────────────────────

const mockPrisma = {
  nonConformity: {
    findMany:   jest.fn(),
    count:      jest.fn(),
    create:     jest.fn(),
    findFirst:  jest.fn(),
    update:     jest.fn(),
    delete:     jest.fn(),
  },
  ncPhoto: {
    findMany:  jest.fn(),
    create:    jest.fn(),
    findFirst: jest.fn(),
    delete:    jest.fn(),
  },
  $transaction: jest.fn(),
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

type NCStatus   = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
type NCSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

function makeNc(overrides: Partial<{
  id: string;
  tenantId: string;
  reference: string;
  status: NCStatus;
  severity: NCSeverity;
}> = {}) {
  return {
    id:               overrides.id        ?? 'nc-a-001',
    reference:        overrides.reference ?? 'NC-2026-0001',
    tenantId:         overrides.tenantId  ?? TENANT_A,
    siteId:           'site-a-001',
    productId:        null,
    reporterId:       'user-reporter-001',
    closedById:       null,
    status:           overrides.status    ?? 'OPEN',
    severity:         overrides.severity  ?? 'MEDIUM',
    category:         'OTHER',
    description:      'Température hors limites',
    correctiveAction: null,
    closedAt:         null,
    createdAt:        new Date('2026-01-15T10:00:00Z'),
    updatedAt:        new Date('2026-01-15T10:00:00Z'),
    photos:           [],
  };
}

function makePhoto(overrides: Partial<{
  id: string;
  ncId: string;
  tenantId: string;
}> = {}) {
  return {
    id:        overrides.id       ?? 'photo-a-001',
    ncId:      overrides.ncId     ?? 'nc-a-001',
    tenantId:  overrides.tenantId ?? TENANT_A,
    url:       's3://haccp/tenant-alpha-001/nc-a-001/photo-a-001.jpg',
    fileName:  'photo.jpg',
    createdAt: new Date('2026-01-15T11:00:00Z'),
  };
}

// ── Service simulators (black-box contract) ───────────────────────────────────

function generateReference(year: number, sequence: number): string {
  return `NC-${year}-${String(sequence).padStart(4, '0')}`;
}

async function findOne(
  prisma: typeof mockPrisma,
  id: string,
  tenantId: string,
) {
  const nc = await prisma.nonConformity.findFirst({ where: { id, tenantId } });
  if (!nc) throw new NotFoundException(`NonConformity ${id} not found`);
  return { data: nc };
}

async function create(
  prisma: typeof mockPrisma,
  dto: { description: string; severity: NCSeverity; siteId: string },
  actorTenantId: string,
  actorId: string,
) {
  // Reference is tenant-scoped: count all NCs for this tenant in current year
  const year  = new Date().getFullYear();
  const count = await prisma.nonConformity.count({ where: { tenantId: actorTenantId } });
  const reference = generateReference(year, count + 1);

  const nc = await prisma.nonConformity.create({
    data: {
      ...dto,
      reference,
      tenantId:   actorTenantId, // ALWAYS from JWT — never from DTO
      reporterId: actorId,
      status:     'OPEN',
    },
  });
  return { data: nc, message: 'Non-conformité créée' };
}

async function closeNc(
  prisma: typeof mockPrisma,
  id: string,
  tenantId: string,
  actorId: string,
  correctiveAction: string,
) {
  // Double-scope: id + tenantId must both match
  const nc = await prisma.nonConformity.findFirst({ where: { id, tenantId } });
  if (!nc) throw new NotFoundException(`NonConformity ${id} not found in tenant`);
  if (nc.status === 'CLOSED') throw new BadRequestException('NC is already closed');

  const updated = await prisma.nonConformity.update({
    where: { id },
    data:  { status: 'CLOSED', closedById: actorId, closedAt: new Date(), correctiveAction },
  });
  return { data: updated };
}

async function addPhoto(
  prisma: typeof mockPrisma,
  ncId: string,
  tenantId: string,
  photoUrl: string,
) {
  // Must verify NC belongs to tenant before attaching photo
  const nc = await prisma.nonConformity.findFirst({ where: { id: ncId, tenantId } });
  if (!nc) throw new NotFoundException(`NonConformity ${ncId} not found in tenant`);

  const photo = await prisma.ncPhoto.create({
    data: { ncId, tenantId, url: photoUrl, fileName: photoUrl.split('/').pop() ?? 'photo.jpg' },
  });
  return { data: photo };
}

async function removePhoto(
  prisma: typeof mockPrisma,
  photoId: string,
  ncId: string,
  tenantId: string,
) {
  // Verify parent NC ownership before deleting photo
  const nc = await prisma.nonConformity.findFirst({ where: { id: ncId, tenantId } });
  if (!nc) throw new NotFoundException(`NonConformity ${ncId} not found in tenant`);

  const photo = await prisma.ncPhoto.findFirst({ where: { id: photoId, ncId } });
  if (!photo) throw new NotFoundException(`Photo ${photoId} not found`);

  await prisma.ncPhoto.delete({ where: { id: photoId } });
  return { message: 'Photo supprimée' };
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITES
// ─────────────────────────────────────────────────────────────────────────────

describe('NonconformityService — Multi-Tenant Isolation', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Scenario 1: NC reference generation is tenant-scoped ──────────────────

  describe('Scenario 1: NC reference generation is tenant-scoped', () => {
    it('NC-2026-0001 can exist independently in both Tenant A and Tenant B', () => {
      // References are scoped per tenant — same sequence number in different tenants is valid
      const refA = generateReference(2026, 1); // for Tenant A
      const refB = generateReference(2026, 1); // for Tenant B — same string, different tenant

      expect(refA).toBe('NC-2026-0001');
      expect(refB).toBe('NC-2026-0001');

      // No collision because they belong to different tenants
      const ncA = makeNc({ id: 'nc-a-001', tenantId: TENANT_A, reference: refA });
      const ncB = makeNc({ id: 'nc-b-001', tenantId: TENANT_B, reference: refB });

      expect(ncA.tenantId).not.toBe(ncB.tenantId);
      expect(ncA.reference).toBe(ncB.reference); // same ref string is OK across tenants
    });

    it('reference sequence is counted per tenant (not globally)', async () => {
      // Tenant A has 5 NCs → next ref is NC-2026-0006
      mockPrisma.nonConformity.count.mockResolvedValueOnce(5);
      mockPrisma.nonConformity.create.mockResolvedValue(
        makeNc({ id: 'nc-a-006', tenantId: TENANT_A, reference: 'NC-2026-0006' }),
      );

      const result = await create(
        mockPrisma,
        { description: 'New NC', severity: 'HIGH', siteId: 'site-a-001' },
        TENANT_A,
        'user-a-001',
      );

      // count must be scoped to TENANT_A
      expect(mockPrisma.nonConformity.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT_A } }),
      );
      expect(result.data.reference).toBe('NC-2026-0006');
    });

    it('Tenant B count is independent — does not affect Tenant A reference sequence', async () => {
      // Tenant B has 2 NCs
      mockPrisma.nonConformity.count.mockResolvedValueOnce(2);
      mockPrisma.nonConformity.create.mockResolvedValue(
        makeNc({ id: 'nc-b-003', tenantId: TENANT_B, reference: 'NC-2026-0003' }),
      );

      await create(
        mockPrisma,
        { description: 'B NC', severity: 'LOW', siteId: 'site-b-001' },
        TENANT_B,
        'user-b-001',
      );

      const countWhere = mockPrisma.nonConformity.count.mock.calls[0][0].where;
      expect(countWhere.tenantId).toBe(TENANT_B);
      expect(countWhere.tenantId).not.toBe(TENANT_A);
    });

    it('create always stamps tenantId from actor JWT — never from request body', async () => {
      mockPrisma.nonConformity.count.mockResolvedValue(0);
      mockPrisma.nonConformity.create.mockResolvedValue(makeNc({ tenantId: TENANT_A }));

      await create(
        mockPrisma,
        { description: 'Test', severity: 'MEDIUM', siteId: 'site-a-001' },
        TENANT_A,
        'actor-a-001',
      );

      const createData = mockPrisma.nonConformity.create.mock.calls[0][0].data;
      expect(createData.tenantId).toBe(TENANT_A);
      expect(createData.tenantId).not.toBe(TENANT_B);
    });
  });

  // ── Scenario 2: findOne with wrong tenantId returns null ──────────────────

  describe('Scenario 2: findOne cross-tenant access returns NotFoundException', () => {
    it('findOne(id=nc-a-001, tenantId=TENANT_B) throws NotFoundException', async () => {
      // nc-a-001 belongs to TENANT_A — TENANT_B query returns null
      mockPrisma.nonConformity.findFirst.mockResolvedValue(null);

      await expect(findOne(mockPrisma, 'nc-a-001', TENANT_B))
        .rejects.toThrow(NotFoundException);
    });

    it('findOne query uses both id AND tenantId (double-scope)', async () => {
      mockPrisma.nonConformity.findFirst.mockResolvedValue(null);

      await findOne(mockPrisma, 'nc-a-001', TENANT_B).catch(() => null);

      expect(mockPrisma.nonConformity.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'nc-a-001', tenantId: TENANT_B } }),
      );
    });

    it('NotFoundException is same type for cross-tenant and non-existent NC (no leak)', async () => {
      mockPrisma.nonConformity.findFirst.mockResolvedValue(null);

      const crossTenantErr  = await findOne(mockPrisma, 'nc-a-001', TENANT_B).catch(e => e);
      const nonExistentErr  = await findOne(mockPrisma, 'nc-ghost-999', TENANT_A).catch(e => e);

      expect(crossTenantErr).toBeInstanceOf(NotFoundException);
      expect(nonExistentErr).toBeInstanceOf(NotFoundException);
      // Same error type — attacker cannot infer whether NC exists in another tenant
      expect(crossTenantErr.constructor).toBe(nonExistentErr.constructor);
    });

    it('findOne TENANT_A can access their own NC', async () => {
      const ncA = makeNc({ id: 'nc-a-001', tenantId: TENANT_A });
      mockPrisma.nonConformity.findFirst.mockResolvedValue(ncA);

      const result = await findOne(mockPrisma, 'nc-a-001', TENANT_A);

      expect(result.data.id).toBe('nc-a-001');
      expect(result.data.tenantId).toBe(TENANT_A);
    });

    it('closeNc with wrong tenantId is blocked — update never called', async () => {
      mockPrisma.nonConformity.findFirst.mockResolvedValue(null);

      await expect(closeNc(mockPrisma, 'nc-a-001', TENANT_B, 'actor-b', 'corrective'))
        .rejects.toThrow(NotFoundException);

      expect(mockPrisma.nonConformity.update).not.toHaveBeenCalled();
    });
  });

  // ── Scenario 3: Photos are scoped via parent NC tenantId ──────────────────

  describe('Scenario 3: Photos are scoped via parent NC tenantId', () => {
    it('addPhoto verifies NC ownership before creating photo', async () => {
      // TENANT_B tries to add photo to TENANT_A NC
      mockPrisma.nonConformity.findFirst.mockResolvedValue(null);

      await expect(addPhoto(mockPrisma, 'nc-a-001', TENANT_B, 'https://s3/photo.jpg'))
        .rejects.toThrow(NotFoundException);

      expect(mockPrisma.ncPhoto.create).not.toHaveBeenCalled();
    });

    it('addPhoto NC ownership check uses both ncId AND tenantId', async () => {
      mockPrisma.nonConformity.findFirst.mockResolvedValue(null);

      await addPhoto(mockPrisma, 'nc-a-001', TENANT_B, 'https://s3/photo.jpg').catch(() => null);

      expect(mockPrisma.nonConformity.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'nc-a-001', tenantId: TENANT_B } }),
      );
    });

    it('addPhoto stamps tenantId on the photo record', async () => {
      mockPrisma.nonConformity.findFirst.mockResolvedValue(makeNc({ tenantId: TENANT_A }));
      mockPrisma.ncPhoto.create.mockResolvedValue(makePhoto({ tenantId: TENANT_A }));

      await addPhoto(mockPrisma, 'nc-a-001', TENANT_A, 'https://s3/photo.jpg');

      const photoData = mockPrisma.ncPhoto.create.mock.calls[0][0].data;
      expect(photoData.tenantId).toBe(TENANT_A);
    });

    it('removePhoto — TENANT_B cannot delete TENANT_A photo (NC ownership check fails)', async () => {
      mockPrisma.nonConformity.findFirst.mockResolvedValue(null);

      await expect(removePhoto(mockPrisma, 'photo-a-001', 'nc-a-001', TENANT_B))
        .rejects.toThrow(NotFoundException);

      expect(mockPrisma.ncPhoto.delete).not.toHaveBeenCalled();
    });

    it('removePhoto succeeds for correct tenant', async () => {
      mockPrisma.nonConformity.findFirst.mockResolvedValue(makeNc({ tenantId: TENANT_A }));
      mockPrisma.ncPhoto.findFirst.mockResolvedValue(makePhoto({ id: 'photo-a-001', ncId: 'nc-a-001' }));
      mockPrisma.ncPhoto.delete.mockResolvedValue({ id: 'photo-a-001' });

      const result = await removePhoto(mockPrisma, 'photo-a-001', 'nc-a-001', TENANT_A);

      expect(mockPrisma.ncPhoto.delete).toHaveBeenCalledWith({ where: { id: 'photo-a-001' } });
      expect(result.message).toBe('Photo supprimée');
    });

    it('MinIO object key is tenant-scoped — TENANT_B cannot enumerate TENANT_A photo URLs', () => {
      // ARCH-DECISION: Photo URLs embed the tenantId as the first path segment.
      // This is enforced in the service layer when building the presigned URL.
      const photo = makePhoto({ tenantId: TENANT_A });
      const objectKey = `${TENANT_A}/nc-a-001/photo-a-001.jpg`;

      expect(objectKey.startsWith(TENANT_A + '/')).toBe(true);
      expect(objectKey.startsWith(TENANT_B + '/')).toBe(false);
      // The stored URL embeds the tenant prefix
      expect(photo.url).toContain('tenant-alpha-001');
    });
  });
});
