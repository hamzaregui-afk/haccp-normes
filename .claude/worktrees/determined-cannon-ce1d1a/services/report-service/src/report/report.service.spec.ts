import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { ReportService } from './report.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateReportDto, UpdateReportDto, ReportQuery } from './dto/report.dto';

// ─── Prisma mock factory ──────────────────────────────────────────────────────

type MockPrismaService = {
  report: {
    findMany:  jest.Mock;
    count:     jest.Mock;
    findFirst: jest.Mock;
    create:    jest.Mock;
    update:    jest.Mock;
    delete:    jest.Mock;
  };
  $transaction: jest.Mock;
};

const buildPrismaMock = (): MockPrismaService => {
  const mock: MockPrismaService = {
    report: {
      findMany:  jest.fn(),
      count:     jest.fn(),
      findFirst: jest.fn(),
      create:    jest.fn(),
      update:    jest.fn(),
      delete:    jest.fn(),
    },
    // ARCH-DECISION: $transaction is mocked to resolve the array of promises
    // passed to it, mirroring Prisma's interactive transaction behaviour.
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
  return mock;
};

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const TENANT_A = 'tenant-aaa';
const TENANT_B = 'tenant-bbb';
const USER_ID  = 'user-001';

const baseReport = {
  id:          'report-001',
  type:        'MONTHLY_HYGIENE',
  status:      'PENDING' as const,
  tenantId:    TENANT_A,
  fileUrl:     null,
  validatedBy: null,
  generatedAt: new Date('2024-06-01T00:00:00Z'),
  validatedAt: null,
  sentAt:      null,
};

const defaultQuery: ReportQuery = { page: 1, limit: 10, status: undefined, type: undefined };

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('ReportService', () => {
  let service: ReportService;
  let prisma:  MockPrismaService;

  beforeEach(async () => {
    prisma = buildPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ReportService>(ReportService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns a paginated list of reports for the correct tenant', async () => {
      prisma.report.findMany.mockResolvedValue([baseReport]);
      prisma.report.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_A, defaultQuery);

      expect(result.data).toHaveLength(1);
      expect(result.meta?.total).toBe(1);
    });

    it('scopes query to tenantId — tenant isolation enforced', async () => {
      prisma.report.findMany.mockResolvedValue([]);
      prisma.report.count.mockResolvedValue(0);

      await service.findAll(TENANT_B, defaultQuery);

      // $transaction receives the raw prisma calls; check via findMany mock
      // The mock resolves the array, so findMany was called with the right where
      const calls = prisma.report.findMany.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const where = (calls[0][0] as { where: Record<string, unknown> }).where;
      expect(where['tenantId']).toBe(TENANT_B);
    });

    it('applies status filter when provided', async () => {
      prisma.report.findMany.mockResolvedValue([]);
      prisma.report.count.mockResolvedValue(0);

      await service.findAll(TENANT_A, { ...defaultQuery, status: 'VALIDATED' });

      const where = (prisma.report.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
      expect(where['status']).toBe('VALIDATED');
    });

    it('applies type filter when provided', async () => {
      prisma.report.findMany.mockResolvedValue([]);
      prisma.report.count.mockResolvedValue(0);

      await service.findAll(TENANT_A, { ...defaultQuery, type: 'ANNUAL_HACCP' });

      const where = (prisma.report.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
      expect(where['type']).toBe('ANNUAL_HACCP');
    });
  });

  // ─── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the report wrapped in ApiResponse when found', async () => {
      prisma.report.findFirst.mockResolvedValue(baseReport);

      const result = await service.findOne('report-001', TENANT_A);

      expect(result.data).toMatchObject({ id: 'report-001', type: 'MONTHLY_HYGIENE' });
    });

    it('throws NotFoundException when the report does not exist', async () => {
      prisma.report.findFirst.mockResolvedValue(null);

      await expect(service.findOne('ghost-id', TENANT_A)).rejects.toThrow(NotFoundException);
    });

    it('enforces tenant isolation — query always includes tenantId', async () => {
      prisma.report.findFirst.mockResolvedValue(null);

      await expect(service.findOne('report-001', TENANT_B)).rejects.toThrow(NotFoundException);

      expect(prisma.report.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'report-001', tenantId: TENANT_B } }),
      );
    });
  });

  // ─── findOneRaw ─────────────────────────────────────────────────────────────

  describe('findOneRaw', () => {
    it('returns the raw Prisma record (not wrapped in ApiResponse)', async () => {
      prisma.report.findFirst.mockResolvedValue(baseReport);

      const result = await service.findOneRaw('report-001', TENANT_A);

      // Raw result should NOT have a `.data` wrapper
      expect(result).not.toHaveProperty('data');
      expect(result).toMatchObject({ id: 'report-001' });
    });

    it('throws NotFoundException when report is missing', async () => {
      prisma.report.findFirst.mockResolvedValue(null);

      await expect(service.findOneRaw('ghost-id', TENANT_A)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const createDto: CreateReportDto = { type: 'MONTHLY_HYGIENE' };

    it('creates a report with PENDING status and returns success message', async () => {
      prisma.report.create.mockResolvedValue(baseReport);

      const result = await service.create(createDto, TENANT_A);

      expect(prisma.report.create).toHaveBeenCalledWith({
        data: { type: 'MONTHLY_HYGIENE', status: 'PENDING', tenantId: TENANT_A },
      });
      expect(result.message).toBe('Report created successfully');
    });

    it('always sets initial status to PENDING regardless of DTO', async () => {
      prisma.report.create.mockResolvedValue(baseReport);

      await service.create(createDto, TENANT_A);

      const createData = prisma.report.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(createData['status']).toBe('PENDING');
    });

    it('attaches tenantId from the parameter to the new record', async () => {
      prisma.report.create.mockResolvedValue({ ...baseReport, tenantId: TENANT_B });

      await service.create(createDto, TENANT_B);

      const createData = prisma.report.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(createData['tenantId']).toBe(TENANT_B);
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates fileUrl and returns the updated report', async () => {
      prisma.report.findFirst.mockResolvedValue(baseReport);
      const updated = { ...baseReport, fileUrl: 'https://minio/report.pdf' };
      prisma.report.update.mockResolvedValue(updated);

      const dto: UpdateReportDto = { fileUrl: 'https://minio/report.pdf' };
      const result = await service.update('report-001', dto, TENANT_A, USER_ID);

      expect(result.data).toMatchObject({ fileUrl: 'https://minio/report.pdf' });
      expect(result.message).toBe('Report updated successfully');
    });

    it('sets validatedBy and validatedAt when status is set to VALIDATED', async () => {
      prisma.report.findFirst.mockResolvedValue(baseReport);
      prisma.report.update.mockResolvedValue({ ...baseReport, status: 'VALIDATED', validatedBy: USER_ID });

      const dto: UpdateReportDto = { status: 'VALIDATED' };
      await service.update('report-001', dto, TENANT_A, USER_ID);

      const updateData = prisma.report.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(updateData['validatedBy']).toBe(USER_ID);
      expect(updateData['validatedAt']).toBeInstanceOf(Date);
    });

    it('sets sentAt when status is set to SENT', async () => {
      prisma.report.findFirst.mockResolvedValue(baseReport);
      prisma.report.update.mockResolvedValue({ ...baseReport, status: 'SENT' });

      const dto: UpdateReportDto = { status: 'SENT' };
      await service.update('report-001', dto, TENANT_A, USER_ID);

      const updateData = prisma.report.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(updateData['sentAt']).toBeInstanceOf(Date);
    });

    it('throws NotFoundException when the report is not in the tenant', async () => {
      prisma.report.findFirst.mockResolvedValue(null);

      await expect(
        service.update('report-001', { fileUrl: 'x' }, TENANT_B, USER_ID),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.report.update).not.toHaveBeenCalled();
    });
  });

  // ─── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes a PENDING report and returns a success message', async () => {
      prisma.report.findFirst.mockResolvedValue(baseReport); // status: PENDING
      prisma.report.delete.mockResolvedValue(baseReport);

      const result = await service.remove('report-001', TENANT_A);

      expect(prisma.report.delete).toHaveBeenCalledWith({ where: { id: 'report-001' } });
      expect(result.message).toBe('Report deleted successfully');
    });

    it('throws NotFoundException when the report does not belong to the tenant', async () => {
      prisma.report.findFirst.mockResolvedValue(null);

      await expect(service.remove('report-001', TENANT_B)).rejects.toThrow(NotFoundException);
      expect(prisma.report.delete).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when trying to delete a non-PENDING report', async () => {
      const validatedReport = { ...baseReport, status: 'VALIDATED' as const };
      prisma.report.findFirst.mockResolvedValue(validatedReport);

      await expect(service.remove('report-001', TENANT_A)).rejects.toThrow(BadRequestException);
      expect(prisma.report.delete).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for SENT reports', async () => {
      const sentReport = { ...baseReport, status: 'SENT' as const };
      prisma.report.findFirst.mockResolvedValue(sentReport);

      await expect(service.remove('report-001', TENANT_A)).rejects.toThrow(
        /Only PENDING reports can be deleted/,
      );
    });
  });

  // ─── getStats ────────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns aggregated counts for all report statuses', async () => {
      // $transaction resolves the 5 count calls in order: total, pending, underReview, validated, sent
      prisma.report.count
        .mockResolvedValueOnce(20) // total
        .mockResolvedValueOnce(5)  // pending
        .mockResolvedValueOnce(3)  // underReview
        .mockResolvedValueOnce(8)  // validated
        .mockResolvedValueOnce(4); // sent

      const result = await service.getStats(TENANT_A);

      expect(result.data).toEqual({
        total:       20,
        pending:     5,
        underReview: 3,
        validated:   8,
        sent:        4,
      });
    });

    it('scopes all count queries to the provided tenantId', async () => {
      prisma.report.count.mockResolvedValue(0);

      await service.getStats(TENANT_B);

      for (const call of prisma.report.count.mock.calls) {
        const where = (call[0] as { where: Record<string, unknown> }).where;
        expect(where['tenantId']).toBe(TENANT_B);
      }
    });
  });
});
