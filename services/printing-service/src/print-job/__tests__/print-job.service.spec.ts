import { Test, TestingModule } from '@nestjs/testing';
import { PrintJobService } from '../print-job.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PrinterService } from '../../printer/printer.service';
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
  let service:   PrintJobService;
  let prisma:    ReturnType<typeof makePrisma>;
  let printers:  { findOne: jest.Mock; findDefault: jest.Mock };
  let templates: { findDefaultForType: jest.Mock };

  function makePrisma() {
    return {
      printJob: {
        create:    jest.fn().mockResolvedValue({ id: 'job1', status: 'PENDING' }),
        update:    jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
        findMany:  jest.fn(),
        count:     jest.fn(),
      },
      printer:      { findFirst: jest.fn().mockResolvedValue(null) },
      mediaProfile: { findFirst: jest.fn().mockResolvedValue(null) },
    };
  }

  beforeEach(async () => {
    prisma    = makePrisma();
    printers  = { findOne: jest.fn(), findDefault: jest.fn() };
    templates = { findDefaultForType: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrintJobService,
        { provide: PrismaService,   useValue: prisma    as unknown as PrismaService },
        { provide: PrinterService,  useValue: printers  as unknown as PrinterService },
        { provide: TemplateService, useValue: templates as unknown as TemplateService },
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

  it('no printer configured → FAILED, never a false COMPLETED', async () => {
    const { printerId: _omit, ...noPrinterDto } = DLC_DTO;
    printers.findDefault.mockResolvedValue(null);
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
});
