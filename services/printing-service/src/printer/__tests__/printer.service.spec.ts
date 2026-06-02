import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrinterService } from '../printer.service';
import { PrismaService } from '../../prisma/prisma.service';

// ── PrismaService mock ────────────────────────────────────────────────────────

const mockPrinter = {
  id:                  'cltest000000000000000000001',
  tenantId:            'cltenant00000000000000000001',
  name:                'Kitchen Zebra',
  model:               'ZD421',
  connectionType:      'NETWORK',
  ipAddress:           '192.168.1.100',
  port:                9100,
  bluetoothIdentifier: null,
  isDefault:           false,
  isActive:            true,
  siteId:              null,
  zoneId:              null,
  createdAt:           new Date('2026-01-01'),
  updatedAt:           new Date('2026-01-01'),
};

const prismaMock = {
  printer: {
    findMany:    jest.fn(),
    findFirst:   jest.fn(),
    count:       jest.fn(),
    create:      jest.fn(),
    update:      jest.fn(),
    updateMany:  jest.fn(),
    delete:      jest.fn(),
  },
  $transaction: jest.fn(),
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('PrinterService', () => {
  let service: PrinterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrinterService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<PrinterService>(PrinterService);

    jest.clearAllMocks();
  });

  // ── create ────────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a printer and returns it wrapped in ApiResponse', async () => {
      prismaMock.printer.create.mockResolvedValue(mockPrinter);
      prismaMock.printer.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.create(
        {
          name:           'Kitchen Zebra',
          connectionType: 'NETWORK',
          ipAddress:      '192.168.1.100',
          port:           9100,
          isDefault:      false,
        },
        'cltenant00000000000000000001',
      );

      expect(result.data).toMatchObject({ name: 'Kitchen Zebra' });
      expect(result.message).toBe('Imprimante créée');
      expect(prismaMock.printer.create).toHaveBeenCalledTimes(1);
    });

    it('demotes other default printers when isDefault=true', async () => {
      prismaMock.printer.create.mockResolvedValue({ ...mockPrinter, isDefault: true });
      prismaMock.printer.updateMany.mockResolvedValue({ count: 1 });

      await service.create(
        {
          name:           'Backup Zebra',
          connectionType: 'NETWORK',
          port:           9100,
          isDefault:      true,
        },
        'cltenant00000000000000000001',
      );

      expect(prismaMock.printer.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 'cltenant00000000000000000001', isDefault: true },
        data:  { isDefault: false },
      });
    });

    it('does NOT call updateMany when isDefault=false', async () => {
      prismaMock.printer.create.mockResolvedValue(mockPrinter);

      await service.create(
        { name: 'Aux Printer', connectionType: 'NETWORK', port: 9100, isDefault: false },
        'cltenant00000000000000000001',
      );

      expect(prismaMock.printer.updateMany).not.toHaveBeenCalled();
    });
  });

  // ── findAll ───────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated list of printers', async () => {
      prismaMock.printer.findMany.mockResolvedValue([mockPrinter]);
      prismaMock.printer.count.mockResolvedValue(1);

      const result = await service.findAll('cltenant00000000000000000001', {
        page:  1,
        limit: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toMatchObject({ total: 1, page: 1, limit: 20, lastPage: 1 });
      expect(prismaMock.printer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'cltenant00000000000000000001' },
          skip:  0,
          take:  20,
        }),
      );
    });

    it('applies connectionType filter when provided', async () => {
      prismaMock.printer.findMany.mockResolvedValue([]);
      prismaMock.printer.count.mockResolvedValue(0);

      await service.findAll('cltenant00000000000000000001', {
        page:           1,
        limit:          20,
        connectionType: 'BLUETOOTH',
      });

      expect(prismaMock.printer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ connectionType: 'BLUETOOTH' }),
        }),
      );
    });
  });

  // ── setDefault ────────────────────────────────────────────────────────────────

  describe('setDefault', () => {
    it('calls $transaction to atomically set the default printer', async () => {
      prismaMock.printer.findFirst.mockResolvedValue(mockPrinter);
      prismaMock.$transaction.mockResolvedValue([{ count: 1 }, mockPrinter]);

      // Stub the individual operations so $transaction receives them
      prismaMock.printer.updateMany.mockReturnValue({ count: 1 });
      prismaMock.printer.update.mockReturnValue({ ...mockPrinter, isDefault: true });

      const result = await service.setDefault(
        'cltest000000000000000000001',
        'cltenant00000000000000000001',
      );

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(result.message).toBe('Imprimante par défaut définie');
    });

    it('throws NotFoundException when the printer does not belong to the tenant', async () => {
      prismaMock.printer.findFirst.mockResolvedValue(null);

      await expect(
        service.setDefault('cltest000000000000000000001', 'cldifferenttenant0000000001'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes the printer and returns a success message', async () => {
      prismaMock.printer.findFirst.mockResolvedValue(mockPrinter);
      prismaMock.printer.delete.mockResolvedValue(mockPrinter);

      const result = await service.remove(
        'cltest000000000000000000001',
        'cltenant00000000000000000001',
      );

      expect(result.message).toBe('Imprimante supprimée');
      expect(prismaMock.printer.delete).toHaveBeenCalledWith({
        where: { id: 'cltest000000000000000000001', tenantId: 'cltenant00000000000000000001' },
      });
    });

    it('throws NotFoundException when printer is not found', async () => {
      prismaMock.printer.findFirst.mockResolvedValue(null);

      await expect(
        service.remove('nonexistentid', 'cltenant00000000000000000001'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
