import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrintJobService } from '../print-job.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PrinterService } from '../../printer/printer.service';
import { PrinterAssignmentService } from '../../printer-assignment/printer-assignment.service';
import { TemplateService } from '../../template/template.service';
import type { CreatePrintJobDto } from '../dto/print-job.dto';

// Domain events → RabbitMQ; stub so tests never touch the broker.
jest.mock('@haccp/shared-utils', () => ({ publishDomainEvent: jest.fn() }));
// TCP transport → stub so the NETWORK branch "succeeds" without a socket.
jest.mock('../../printer/tcp.printer', () => ({
  sendZplOverTcp: jest.fn().mockResolvedValue(undefined),
}));

import { sendZplOverTcp } from '../../printer/tcp.printer';

// Let the fire-and-forget executePrint pipeline (started but not awaited by
// create()) run to completion before we assert on the persisted status.
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const basePrinter = {
  id: 'p1', tenantId: 't1', name: 'P', connectionType: 'NETWORK',
  ipAddress: '10.0.0.5', port: 9100, protocol: 'ZPL', connection: null,
};

const DLC_DTO: CreatePrintJobDto = {
  printerId: 'p1',
  labelType: 'DLC',
  payload: {
    productName: 'Lait entier',
    producedAt: '2026-01-01T00:00:00.000Z',
    expiresAt:  '2026-01-05T00:00:00.000Z',
  },
  copies: 1,
};

describe('PrintJobService — execution status (HACCP audit integrity)', () => {
  let service:     PrintJobService;
  let prisma:      ReturnType<typeof makePrisma>;
  let printers:    { findOne: jest.Mock; findDefault: jest.Mock };
  let assignments: { resolve: jest.Mock };
  let templates:   { findDefaultForType: jest.Mock };

  function makePrisma() {
    return {
      printJob: {
        create:     jest.fn().mockResolvedValue({ id: 'job1', status: 'PENDING' }),
        update:     jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst:  jest.fn(),
        findMany:   jest.fn(),
        count:      jest.fn(),
      },
      printer:      { findFirst: jest.fn().mockResolvedValue(null) },
      mediaProfile: { findFirst: jest.fn().mockResolvedValue(null) },
    };
  }

  beforeEach(async () => {
    prisma      = makePrisma();
    printers    = { findOne: jest.fn(), findDefault: jest.fn() };
    assignments = { resolve: jest.fn().mockResolvedValue({ data: null }) };
    templates   = { findDefaultForType: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrintJobService,
        { provide: PrismaService,            useValue: prisma      as unknown as PrismaService },
        { provide: PrinterService,           useValue: printers    as unknown as PrinterService },
        { provide: PrinterAssignmentService, useValue: assignments as unknown as PrinterAssignmentService },
        { provide: TemplateService,          useValue: templates   as unknown as TemplateService },
      ],
    }).compile();

    service = module.get<PrintJobService>(PrintJobService);
    (sendZplOverTcp as jest.Mock).mockClear();
  });

  // Status of the LAST printJob.update (the terminal transition of executePrint).
  const lastStatus = (): string => {
    const calls = prisma.printJob.update.mock.calls;
    const data  = (calls[calls.length - 1]?.[0] as { data: { status: string } }).data;
    return data.status;
  };

  it('NETWORK printer with IP → sends over TCP and marks COMPLETED', async () => {
    printers.findOne.mockResolvedValue({ data: { ...basePrinter, connectionType: 'NETWORK' } });
    await service.create(DLC_DTO, 't1', 'u1');
    await flush();
    expect(sendZplOverTcp).toHaveBeenCalledTimes(1);
    expect(lastStatus()).toBe('COMPLETED');
  });

  it('USB printer → stays PENDING for the Local Print Agent (no direct print)', async () => {
    printers.findOne.mockResolvedValue({ data: { ...basePrinter, connectionType: 'USB', ipAddress: null } });
    await service.create(DLC_DTO, 't1', 'u1');
    await flush();
    expect(sendZplOverTcp).not.toHaveBeenCalled();
    expect(lastStatus()).toBe('PENDING');
  });

  it('BLUETOOTH printer → stays PENDING (was falsely marked COMPLETED before the fix)', async () => {
    printers.findOne.mockResolvedValue({ data: { ...basePrinter, connectionType: 'BLUETOOTH', ipAddress: null } });
    await service.create(DLC_DTO, 't1', 'u1');
    await flush();
    expect(sendZplOverTcp).not.toHaveBeenCalled();
    expect(lastStatus()).toBe('PENDING');
  });

  it('no printer resolved → FAILED, never a false COMPLETED', async () => {
    const { printerId: _omit, ...noPrinterDto } = DLC_DTO;
    assignments.resolve.mockResolvedValue({ data: null }); // no assignment, no tenant default
    await service.create(noPrinterDto, 't1', 'u1');
    await flush();
    expect(lastStatus()).toBe('FAILED');
  });

  it('NETWORK printer without an IP → FAILED (explicit misconfiguration)', async () => {
    printers.findOne.mockResolvedValue({ data: { ...basePrinter, connectionType: 'NETWORK', ipAddress: null } });
    await service.create(DLC_DTO, 't1', 'u1');
    await flush();
    expect(lastStatus()).toBe('FAILED');
  });

  it('no explicit printer → routes via PrinterAssignment.resolve (context-aware)', async () => {
    // A resolved NETWORK printer prints synchronously → COMPLETED, proving the
    // assignment resolver (zone/site/user/module) is wired into job creation.
    assignments.resolve.mockResolvedValue({ data: { ...basePrinter, connectionType: 'NETWORK' } });
    const { printerId: _omit, ...ctxDto } = DLC_DTO;
    await service.create({ ...ctxDto, zoneId: 'zone-1' } as CreatePrintJobDto, 't1', 'u1');
    await flush();
    expect(assignments.resolve).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ zoneId: 'zone-1', userId: 'u1' }),
    );
    expect(sendZplOverTcp).toHaveBeenCalled();
    expect(lastStatus()).toBe('COMPLETED');
  });

  // ── Atomic claim (Local Print Agent) ────────────────────────────────────────
  describe('updateStatus — atomic claim', () => {
    it('PENDING→PROCESSING claims via a conditional updateMany (winner)', async () => {
      prisma.printJob.updateMany.mockResolvedValue({ count: 1 });
      await expect(service.updateStatus('job1', 't1', 'PROCESSING')).resolves.toBeDefined();
      expect(prisma.printJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'job1', tenantId: 't1', status: 'PENDING' }),
        }),
      );
    });

    it('a second claimant (updateMany count=0, job exists) gets a Conflict', async () => {
      prisma.printJob.updateMany.mockResolvedValue({ count: 0 });
      prisma.printJob.findFirst.mockResolvedValue({ id: 'job1' });
      await expect(service.updateStatus('job1', 't1', 'PROCESSING'))
        .rejects.toBeInstanceOf(ConflictException);
    });
  });
});
