import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrinterAssignmentService } from '../printer-assignment.service';
import { PrismaService } from '../../prisma/prisma.service';

const TENANT = 'cltenant00000000000000000001';
const PRINTER_KITCHEN = { id: 'clprt0000000000000000kitchen', name: 'Cuisine', isActive: true };
const PRINTER_PROD    = { id: 'clprt00000000000000000proda', name: 'Production', isActive: true };

const prismaMock = {
  printer: {
    findFirst: jest.fn(),
  },
  printerAssignment: {
    findMany:  jest.fn(),
    findFirst: jest.fn(),
    count:     jest.fn(),
    create:    jest.fn(),
    update:    jest.fn(),
    delete:    jest.fn(),
  },
};

describe('PrinterAssignmentService', () => {
  let service: PrinterAssignmentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrinterAssignmentService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get<PrinterAssignmentService>(PrinterAssignmentService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('rejects when the printer does not belong to the tenant', async () => {
      prismaMock.printer.findFirst.mockResolvedValue(null);
      await expect(
        service.create({ printerId: 'foreign', scope: 'MODULE', referenceId: 'DLC', priority: 0 }, TENANT),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.printerAssignment.create).not.toHaveBeenCalled();
    });

    it('maps a unique-constraint violation to ConflictException', async () => {
      prismaMock.printer.findFirst.mockResolvedValue(PRINTER_KITCHEN);
      prismaMock.printerAssignment.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.22.0' }),
      );
      await expect(
        service.create({ printerId: PRINTER_KITCHEN.id, scope: 'MODULE', referenceId: 'DLC', priority: 0 }, TENANT),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates the assignment scoped to the tenant', async () => {
      prismaMock.printer.findFirst.mockResolvedValue(PRINTER_KITCHEN);
      prismaMock.printerAssignment.create.mockResolvedValue({ id: 'cla1', tenantId: TENANT });
      await service.create({ printerId: PRINTER_KITCHEN.id, scope: 'MODULE', referenceId: 'DLC', priority: 5 }, TENANT);
      expect(prismaMock.printerAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: TENANT, scope: 'MODULE', referenceId: 'DLC', priority: 5 }),
        }),
      );
    });
  });

  describe('resolve', () => {
    it('prefers the more specific scope (ZONE over MODULE)', async () => {
      prismaMock.printerAssignment.findMany.mockResolvedValue([
        { scope: 'MODULE', priority: 100, printer: PRINTER_PROD },
        { scope: 'ZONE',   priority: 0,   printer: PRINTER_KITCHEN },
      ]);
      const res = await service.resolve(TENANT, { module: 'DLC', zoneId: 'zone-1' });
      expect((res.data as { id: string }).id).toBe(PRINTER_KITCHEN.id);
      expect(prismaMock.printer.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to the tenant default printer when no rule matches', async () => {
      prismaMock.printerAssignment.findMany.mockResolvedValue([]);
      prismaMock.printer.findFirst.mockResolvedValue(PRINTER_PROD);
      const res = await service.resolve(TENANT, { module: 'DLC' });
      expect(prismaMock.printer.findFirst).toHaveBeenCalledWith({
        where: { tenantId: TENANT, isDefault: true, isActive: true },
      });
      expect((res.data as { id: string }).id).toBe(PRINTER_PROD.id);
    });

    it('returns null data when nothing matches and there is no default', async () => {
      prismaMock.printerAssignment.findMany.mockResolvedValue([]);
      prismaMock.printer.findFirst.mockResolvedValue(null);
      const res = await service.resolve(TENANT, {});
      expect(res.data).toBeNull();
    });
  });
});
