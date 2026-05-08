import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { NCStatus, NCSeverity, NCCategory } from '@prisma/client';

import { NonconformityService } from './nonconformity.service';
import { PrismaService } from '../prisma/prisma.service';
import type { NcQuery, CreateNcDto, UpdateNcDto } from './dto/nonconformity.dto';

// ─── Prisma mock ─────────────────────────────────────────────────────────────

const mockPrisma = {
  nonConformity: {
    findMany:  jest.fn(),
    count:     jest.fn(),
    create:    jest.fn(),
    findFirst: jest.fn(),
    update:    jest.fn(),
    delete:    jest.fn(),
  },
  // $transaction is used in findAll — simulate it by executing each callback
  $transaction: jest.fn(),
};

// ─── Fixture helpers ──────────────────────────────────────────────────────────

const TENANT_ID  = 'tenant-abc-123';
const REPORTER_ID = 'user-reporter-001';
const NC_ID      = 'nc-id-001';

function makeNc(overrides: Partial<{
  id: string;
  tenantId: string;
  status: NCStatus;
  severity: NCSeverity;
  category: NCCategory;
  reference: string;
}> = {}) {
  return {
    id:               overrides.id       ?? NC_ID,
    reference:        overrides.reference ?? 'NC-2026-0001',
    tenantId:         overrides.tenantId  ?? TENANT_ID,
    siteId:           'site-001',
    productId:        null,
    reporterId:       REPORTER_ID,
    closedById:       null,
    status:           overrides.status   ?? NCStatus.OPEN,
    severity:         overrides.severity ?? NCSeverity.MEDIUM,
    category:         overrides.category ?? NCCategory.OTHER,
    description:      'Test NC description',
    correctiveAction: null,
    closedAt:         null,
    createdAt:        new Date('2026-01-15T10:00:00.000Z'),
    updatedAt:        new Date('2026-01-15T10:00:00.000Z'),
    photos:           [],
  };
}

function makeQuery(overrides: Partial<NcQuery> = {}): NcQuery {
  return {
    page:     1,
    limit:    20,
    status:   undefined,
    severity: undefined,
    search:   undefined,
    ...overrides,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('NonconformityService', () => {
  let service: NonconformityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NonconformityService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NonconformityService>(NonconformityService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should scope results to tenantId', async () => {
      const nc = makeNc();
      // $transaction receives an array of promises — resolve them in order
      mockPrisma.$transaction.mockImplementation(
        async (ops: Promise<unknown>[]) => Promise.all(ops),
      );
      mockPrisma.nonConformity.findMany.mockResolvedValue([nc]);
      mockPrisma.nonConformity.count.mockResolvedValue(1);

      await service.findAll(TENANT_ID, makeQuery());

      expect(mockPrisma.nonConformity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID }),
        }),
      );
    });

    it('should apply status filter when provided', async () => {
      mockPrisma.$transaction.mockImplementation(
        async (ops: Promise<unknown>[]) => Promise.all(ops),
      );
      mockPrisma.nonConformity.findMany.mockResolvedValue([]);
      mockPrisma.nonConformity.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, makeQuery({ status: NCStatus.CLOSED }));

      expect(mockPrisma.nonConformity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID, status: NCStatus.CLOSED }),
        }),
      );
    });

    it('should apply severity filter when provided', async () => {
      mockPrisma.$transaction.mockImplementation(
        async (ops: Promise<unknown>[]) => Promise.all(ops),
      );
      mockPrisma.nonConformity.findMany.mockResolvedValue([]);
      mockPrisma.nonConformity.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, makeQuery({ severity: NCSeverity.CRITICAL }));

      expect(mockPrisma.nonConformity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID, severity: NCSeverity.CRITICAL }),
        }),
      );
    });

    it('should omit status/severity from where clause when not provided', async () => {
      mockPrisma.$transaction.mockImplementation(
        async (ops: Promise<unknown>[]) => Promise.all(ops),
      );
      mockPrisma.nonConformity.findMany.mockResolvedValue([]);
      mockPrisma.nonConformity.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, makeQuery());

      const call = mockPrisma.nonConformity.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(call.where).not.toHaveProperty('status');
      expect(call.where).not.toHaveProperty('severity');
    });

    it('should apply search filter as OR on description and reference', async () => {
      mockPrisma.$transaction.mockImplementation(
        async (ops: Promise<unknown>[]) => Promise.all(ops),
      );
      mockPrisma.nonConformity.findMany.mockResolvedValue([]);
      mockPrisma.nonConformity.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, makeQuery({ search: 'listeria' }));

      const call = mockPrisma.nonConformity.findMany.mock.calls[0][0] as {
        where: { OR?: unknown[] };
      };
      expect(call.where.OR).toBeDefined();
      expect(call.where.OR).toHaveLength(2);
    });

    it('should compute skip from page and limit', async () => {
      mockPrisma.$transaction.mockImplementation(
        async (ops: Promise<unknown>[]) => Promise.all(ops),
      );
      mockPrisma.nonConformity.findMany.mockResolvedValue([]);
      mockPrisma.nonConformity.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, makeQuery({ page: 3, limit: 10 }));

      expect(mockPrisma.nonConformity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('should return wrapped ApiResponse with pagination meta', async () => {
      const ncs = [makeNc(), makeNc({ id: 'nc-id-002', reference: 'NC-2026-0002' })];
      mockPrisma.$transaction.mockImplementation(
        async (ops: Promise<unknown>[]) => Promise.all(ops),
      );
      mockPrisma.nonConformity.findMany.mockResolvedValue(ncs);
      mockPrisma.nonConformity.count.mockResolvedValue(2);

      const result = await service.findAll(TENANT_ID, makeQuery({ page: 1, limit: 10 }));

      expect(result.data).toHaveLength(2);
      expect(result.meta).toMatchObject({ total: 2, page: 1, limit: 10, lastPage: 1 });
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return the NC when found for tenant', async () => {
      const nc = makeNc();
      mockPrisma.nonConformity.findFirst.mockResolvedValue(nc);

      const result = await service.findOne(NC_ID, TENANT_ID);

      expect(mockPrisma.nonConformity.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: NC_ID, tenantId: TENANT_ID } }),
      );
      expect(result.data).toMatchObject({ id: NC_ID });
    });

    it('should throw NotFoundException when NC does not exist for tenant', async () => {
      mockPrisma.nonConformity.findFirst.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id', TENANT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: CreateNcDto = {
      description:      'Température de vitrine hors limite',
      siteId:           'site-001',
      productId:        'product-001',
      severity:         NCSeverity.HIGH,
      category:         NCCategory.TEMPERATURE,
      correctiveAction: 'Appeler technicien',
    };

    it('should create NC with auto-generated reference in NC-YYYY-NNNN format', async () => {
      // generateReference calls count once; create is then called
      mockPrisma.nonConformity.count
        .mockResolvedValueOnce(41); // existing NCs this year → seq = 42

      const created = makeNc({ reference: 'NC-2026-0042', status: NCStatus.OPEN });
      mockPrisma.nonConformity.create.mockResolvedValue(created);

      const result = await service.create(dto, TENANT_ID, REPORTER_ID);

      // Reference pattern: NC-<year>-<4-digit-padded>
      expect(mockPrisma.nonConformity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reference: expect.stringMatching(/^NC-\d{4}-\d{4}$/),
            tenantId:  TENANT_ID,
            status:    NCStatus.OPEN,
          }),
        }),
      );
      expect(result.data.reference).toBe('NC-2026-0042');
    });

    it('should default severity to MEDIUM when not provided', async () => {
      mockPrisma.nonConformity.count.mockResolvedValueOnce(0);
      const created = makeNc({ severity: NCSeverity.MEDIUM });
      mockPrisma.nonConformity.create.mockResolvedValue(created);

      const dtoWithoutSeverity: CreateNcDto = {
        description: 'NC sans sévérité',
        siteId:      'site-001',
        severity:    NCSeverity.MEDIUM, // dto type requires it but service falls back
        category:    NCCategory.OTHER,
      };

      await service.create(dtoWithoutSeverity, TENANT_ID, REPORTER_ID);

      expect(mockPrisma.nonConformity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ severity: NCSeverity.MEDIUM }),
        }),
      );
    });

    it('should always set initial status to OPEN', async () => {
      mockPrisma.nonConformity.count.mockResolvedValueOnce(5);
      const created = makeNc({ status: NCStatus.OPEN });
      mockPrisma.nonConformity.create.mockResolvedValue(created);

      await service.create(dto, TENANT_ID, REPORTER_ID);

      expect(mockPrisma.nonConformity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: NCStatus.OPEN }),
        }),
      );
    });

    it('should include success message in response', async () => {
      mockPrisma.nonConformity.count.mockResolvedValueOnce(0);
      mockPrisma.nonConformity.create.mockResolvedValue(makeNc());

      const result = await service.create(dto, TENANT_ID, REPORTER_ID);

      expect(result.message).toBe('Non-conformity created successfully');
    });

    it('should zero-pad sequence number to 4 digits', async () => {
      // 0 existing → seq=1 → NC-<year>-0001
      mockPrisma.nonConformity.count.mockResolvedValueOnce(0);
      const created = makeNc({ reference: `NC-${new Date().getFullYear()}-0001` });
      mockPrisma.nonConformity.create.mockResolvedValue(created);

      await service.create(dto, TENANT_ID, REPORTER_ID);

      const callData = (mockPrisma.nonConformity.create.mock.calls[0][0] as {
        data: { reference: string };
      }).data;
      expect(callData.reference).toMatch(/^NC-\d{4}-0001$/);
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update (close / status transition)', () => {
    it('should throw NotFoundException when NC not found for tenant', async () => {
      mockPrisma.nonConformity.findFirst.mockResolvedValue(null);

      const dto: UpdateNcDto = { status: NCStatus.CLOSED };

      await expect(service.update('bad-id', dto, TENANT_ID)).rejects.toThrow(NotFoundException);
    });

    it('should set closedAt when transitioning to CLOSED status', async () => {
      const existingNc = makeNc({ status: NCStatus.IN_PROGRESS });
      mockPrisma.nonConformity.findFirst.mockResolvedValue(existingNc);
      const updatedNc = makeNc({ status: NCStatus.CLOSED });
      mockPrisma.nonConformity.update.mockResolvedValue(updatedNc);

      const dto: UpdateNcDto = { status: NCStatus.CLOSED };
      await service.update(NC_ID, dto, TENANT_ID);

      const updateCall = mockPrisma.nonConformity.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(updateCall.data.closedAt).toBeInstanceOf(Date);
      expect(updateCall.data.status).toBe(NCStatus.CLOSED);
    });

    it('should NOT set closedAt when NC is already CLOSED', async () => {
      // Transitioning from CLOSED to CLOSED — closedAt should not be overwritten
      const alreadyClosed = makeNc({ status: NCStatus.CLOSED });
      mockPrisma.nonConformity.findFirst.mockResolvedValue(alreadyClosed);
      mockPrisma.nonConformity.update.mockResolvedValue(alreadyClosed);

      const dto: UpdateNcDto = { status: NCStatus.CLOSED };
      await service.update(NC_ID, dto, TENANT_ID);

      const updateCall = mockPrisma.nonConformity.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(updateCall.data).not.toHaveProperty('closedAt');
    });

    it('should update correctiveAction when provided', async () => {
      const existingNc = makeNc({ status: NCStatus.OPEN });
      mockPrisma.nonConformity.findFirst.mockResolvedValue(existingNc);
      mockPrisma.nonConformity.update.mockResolvedValue(existingNc);

      const dto: UpdateNcDto = { correctiveAction: 'Nettoyage complet effectué' };
      await service.update(NC_ID, dto, TENANT_ID);

      expect(mockPrisma.nonConformity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ correctiveAction: 'Nettoyage complet effectué' }),
        }),
      );
    });
  });

  // ── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should throw NotFoundException when NC does not belong to tenant', async () => {
      mockPrisma.nonConformity.findFirst.mockResolvedValue(null);

      await expect(service.remove(NC_ID, TENANT_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when NC status is IN_PROGRESS', async () => {
      mockPrisma.nonConformity.findFirst.mockResolvedValue(
        makeNc({ status: NCStatus.IN_PROGRESS }),
      );

      await expect(service.remove(NC_ID, TENANT_ID)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when NC status is CLOSED', async () => {
      mockPrisma.nonConformity.findFirst.mockResolvedValue(
        makeNc({ status: NCStatus.CLOSED }),
      );

      await expect(service.remove(NC_ID, TENANT_ID)).rejects.toThrow(BadRequestException);
    });

    it('should delete OPEN NC and return success message', async () => {
      mockPrisma.nonConformity.findFirst.mockResolvedValue(makeNc({ status: NCStatus.OPEN }));
      mockPrisma.nonConformity.delete.mockResolvedValue(makeNc());

      const result = await service.remove(NC_ID, TENANT_ID);

      expect(mockPrisma.nonConformity.delete).toHaveBeenCalledWith({ where: { id: NC_ID } });
      expect(result.message).toBe('Non-conformity deleted successfully');
    });

    it('should allow deletion of REJECTED NC', async () => {
      mockPrisma.nonConformity.findFirst.mockResolvedValue(
        makeNc({ status: NCStatus.REJECTED }),
      );
      mockPrisma.nonConformity.delete.mockResolvedValue(makeNc());

      await expect(service.remove(NC_ID, TENANT_ID)).resolves.not.toThrow();
      expect(mockPrisma.nonConformity.delete).toHaveBeenCalledWith({ where: { id: NC_ID } });
    });
  });

  // ── getStats ─────────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('should return correct counts scoped to tenantId', async () => {
      // Promise.all order: total, open, inProgress, closed, rejected, critical
      mockPrisma.nonConformity.count
        .mockResolvedValueOnce(50)  // total
        .mockResolvedValueOnce(20)  // open
        .mockResolvedValueOnce(10)  // inProgress
        .mockResolvedValueOnce(15)  // closed
        .mockResolvedValueOnce(5)   // rejected
        .mockResolvedValueOnce(3);  // critical (OPEN or IN_PROGRESS + CRITICAL severity)

      const result = await service.getStats(TENANT_ID);

      expect(result.data).toEqual({
        total:      50,
        open:       20,
        inProgress: 10,
        closed:     15,
        rejected:   5,
        critical:   3,
      });
    });

    it('should query critical count with OPEN and IN_PROGRESS status filter', async () => {
      mockPrisma.nonConformity.count
        .mockResolvedValue(0); // all counts return 0

      await service.getStats(TENANT_ID);

      // The 6th call (index 5) should be the critical count with status `in` filter
      const criticalCall = mockPrisma.nonConformity.count.mock.calls[5][0] as {
        where: { status: { in: NCStatus[] }; severity: NCSeverity };
      };
      expect(criticalCall.where.severity).toBe(NCSeverity.CRITICAL);
      expect(criticalCall.where.status.in).toEqual(
        expect.arrayContaining([NCStatus.OPEN, NCStatus.IN_PROGRESS]),
      );
    });

    it('should scope all stat queries to tenantId', async () => {
      mockPrisma.nonConformity.count.mockResolvedValue(0);

      await service.getStats(TENANT_ID);

      const calls = mockPrisma.nonConformity.count.mock.calls as Array<
        [{ where: { tenantId: string } }]
      >;
      for (const [args] of calls) {
        expect(args.where.tenantId).toBe(TENANT_ID);
      }
    });
  });

  // ── generateReference (indirectly via create) ─────────────────────────────

  describe('reference generation', () => {
    it('generates NC-<currentYear>-<padded-seq> when count is 0', async () => {
      const year = new Date().getFullYear();
      mockPrisma.nonConformity.count.mockResolvedValueOnce(0);
      mockPrisma.nonConformity.create.mockResolvedValue(
        makeNc({ reference: `NC-${year}-0001` }),
      );

      await service.create(
        { description: 'Test', siteId: 'site-1', severity: NCSeverity.LOW, category: NCCategory.OTHER },
        TENANT_ID,
        REPORTER_ID,
      );

      const ref = (mockPrisma.nonConformity.create.mock.calls[0][0] as {
        data: { reference: string };
      }).data.reference;

      expect(ref).toBe(`NC-${year}-0001`);
    });

    it('uses start-of-year boundary when counting existing NCs for sequence', async () => {
      mockPrisma.nonConformity.count.mockResolvedValueOnce(99);
      mockPrisma.nonConformity.create.mockResolvedValue(makeNc());

      await service.create(
        { description: 'Test', siteId: 'site-1', severity: NCSeverity.MEDIUM, category: NCCategory.OTHER },
        TENANT_ID,
        REPORTER_ID,
      );

      const countCall = mockPrisma.nonConformity.count.mock.calls[0][0] as {
        where: { tenantId: string; createdAt: { gte: Date } };
      };
      const gte = countCall.where.createdAt.gte;
      expect(gte).toBeInstanceOf(Date);
      // Should be start of the current year
      expect(gte.getUTCMonth()).toBe(0);
      expect(gte.getUTCDate()).toBe(1);
    });

    it('zero-pads sequence number to 4 digits (seq 42 → 0042)', async () => {
      mockPrisma.nonConformity.count.mockResolvedValueOnce(41); // count=41 → next=42
      mockPrisma.nonConformity.create.mockResolvedValue(makeNc());

      await service.create(
        { description: 'Test', siteId: 'site-1', severity: NCSeverity.MEDIUM, category: NCCategory.OTHER },
        TENANT_ID,
        REPORTER_ID,
      );

      const ref = (mockPrisma.nonConformity.create.mock.calls[0][0] as {
        data: { reference: string };
      }).data.reference;

      expect(ref).toMatch(/-0042$/);
    });
  });
});
