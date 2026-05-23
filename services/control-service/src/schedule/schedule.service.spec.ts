/**
 * schedule.service.spec.ts
 *
 * Unit tests for ScheduleService. No I/O — all Prisma calls are mocked.
 *
 * Coverage:
 *   findAll        — tenant scoping, optional filters, pagination
 *   findOne        — not found → NotFoundException
 *   create         — template validation, recurrence validation, nextRunAt computation
 *   update         — not found, recurrence re-computation
 *   deactivate     — not found, soft-delete shape
 *   previewOccurrences — not found, returns capped ISO list
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService }    from '../prisma/prisma.service';
import { ScheduleService }  from './schedule.service';
import { RecurrenceEngine } from './recurrence/recurrence.engine';

// ── Prisma mock ───────────────────────────────────────────────────────────────

const mockControlSchedule = {
  findMany:  jest.fn(),
  count:     jest.fn(),
  create:    jest.fn(),
  findFirst: jest.fn(),
  update:    jest.fn(),
};

const mockControlTemplate = {
  findFirst: jest.fn(),
};

const mockPrisma = {
  controlSchedule: mockControlSchedule,
  controlTemplate:  mockControlTemplate,
  // ARCH-DECISION: $transaction receives an array of Prisma promises. Tests
  // resolve them concurrently with Promise.all — preserves positional destructuring.
  $transaction: jest.fn().mockImplementation((ops: Promise<unknown>[]) =>
    Promise.all(ops),
  ),
};

// ── RecurrenceEngine mock ─────────────────────────────────────────────────────
// Static class — mock at the module level so ScheduleService picks up the stub.

jest.mock('./recurrence/recurrence.engine', () => ({
  RecurrenceEngine: {
    getNextOccurrence:       jest.fn(),
    getOccurrencesInWindow:  jest.fn(),
  },
}));

const mockGetNextOccurrence      = RecurrenceEngine.getNextOccurrence      as jest.Mock;
const mockGetOccurrencesInWindow = RecurrenceEngine.getOccurrencesInWindow as jest.Mock;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_A    = 'tenant-aaa';
const TENANT_B    = 'tenant-bbb';
const TEMPLATE_ID = 'tpl-001';
const SCHEDULE_ID = 'sched-001';
const USER_ID     = 'user-001';

function makeTemplate(overrides: { tenantId?: string | null } = {}) {
  return {
    id:            TEMPLATE_ID,
    tenantId:      overrides.tenantId !== undefined ? overrides.tenantId : TENANT_A,
    name:          'Contrôle température',
    checklistJson: [],
    frequency:     'DAILY',
    createdAt:     new Date('2025-01-01'),
  };
}

const BASE_RECURRENCE = {
  interval:            1,
  timeSlots:           ['08:00'],
  advanceGenerateDays: 7,
};

function makeSchedule(overrides: Partial<{
  id:       string;
  tenantId: string;
  isActive: boolean;
  frequency: string;
  nextRunAt: Date | null;
  endDate:   Date | null;
  recurrenceJson: object;
}> = {}) {
  return {
    id:             overrides.id         ?? SCHEDULE_ID,
    tenantId:       overrides.tenantId   ?? TENANT_A,
    templateId:     TEMPLATE_ID,
    zoneId:         'zone-001',
    assigneeId:     USER_ID,
    groupId:        null,
    frequency:      overrides.frequency  ?? 'DAILY',
    recurrenceJson: overrides.recurrenceJson ?? BASE_RECURRENCE,
    timezone:       'Europe/Paris',
    startDate:      new Date('2025-01-01'),
    endDate:        overrides.endDate    !== undefined ? overrides.endDate : null,
    isActive:       overrides.isActive   !== undefined ? overrides.isActive : true,
    lastGeneratedAt: null,
    nextRunAt:      overrides.nextRunAt  !== undefined ? overrides.nextRunAt : new Date('2025-01-02T08:00:00Z'),
    createdBy:      USER_ID,
    createdAt:      new Date('2025-01-01'),
    updatedAt:      new Date('2025-01-01'),
    template:       { id: TEMPLATE_ID, name: 'Contrôle température' },
  };
}

const NEXT_RUN = new Date('2025-06-01T08:00:00Z');

// ── Test suite ────────────────────────────────────────────────────────────────

describe('ScheduleService', () => {
  let service: ScheduleService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ScheduleService>(ScheduleService);
    jest.clearAllMocks();

    // Default: getNextOccurrence returns a fixed future date
    mockGetNextOccurrence.mockReturnValue(NEXT_RUN);
    // Default: getOccurrencesInWindow returns 3 sample dates
    mockGetOccurrencesInWindow.mockReturnValue([
      new Date('2025-06-01T08:00:00Z'),
      new Date('2025-06-02T08:00:00Z'),
      new Date('2025-06-03T08:00:00Z'),
    ]);
  });

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('scopes query to tenantId', async () => {
      mockControlSchedule.findMany.mockResolvedValue([makeSchedule()]);
      mockControlSchedule.count.mockResolvedValue(1);

      await service.findAll(TENANT_A, { page: 1, limit: 20 });

      expect(mockControlSchedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) }),
      );
    });

    it('does NOT leak tenant B schedules to tenant A', async () => {
      mockControlSchedule.findMany.mockResolvedValue([]);
      mockControlSchedule.count.mockResolvedValue(0);

      await service.findAll(TENANT_A, { page: 1, limit: 20 });

      const { where } = mockControlSchedule.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(where.tenantId).toBe(TENANT_A);
      expect(where.tenantId).not.toBe(TENANT_B);
    });

    it('applies templateId filter when provided', async () => {
      mockControlSchedule.findMany.mockResolvedValue([]);
      mockControlSchedule.count.mockResolvedValue(0);

      await service.findAll(TENANT_A, { page: 1, limit: 20, templateId: TEMPLATE_ID });

      const { where } = mockControlSchedule.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(where.templateId).toBe(TEMPLATE_ID);
    });

    it('applies isActive filter when provided', async () => {
      mockControlSchedule.findMany.mockResolvedValue([]);
      mockControlSchedule.count.mockResolvedValue(0);

      await service.findAll(TENANT_A, { page: 1, limit: 20, isActive: false });

      const { where } = mockControlSchedule.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(where.isActive).toBe(false);
    });

    it('does not apply templateId filter when omitted', async () => {
      mockControlSchedule.findMany.mockResolvedValue([]);
      mockControlSchedule.count.mockResolvedValue(0);

      await service.findAll(TENANT_A, { page: 1, limit: 20 });

      const { where } = mockControlSchedule.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(where).not.toHaveProperty('templateId');
    });

    it('computes correct skip for page 3 with limit 10', async () => {
      mockControlSchedule.findMany.mockResolvedValue([]);
      mockControlSchedule.count.mockResolvedValue(30);

      await service.findAll(TENANT_A, { page: 3, limit: 10 });

      const { skip } = mockControlSchedule.findMany.mock.calls[0][0] as { skip: number };
      expect(skip).toBe(20);
    });

    it('returns pagination meta with correct total and lastPage', async () => {
      mockControlSchedule.findMany.mockResolvedValue([makeSchedule()]);
      mockControlSchedule.count.mockResolvedValue(45);

      const result = await service.findAll(TENANT_A, { page: 2, limit: 10 });

      expect(result.meta?.total).toBe(45);
      expect(result.meta?.lastPage).toBe(5);
      expect(result.meta?.page).toBe(2);
    });
  });

  // ── findOne ──────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns schedule when found for tenant', async () => {
      const sched = makeSchedule();
      mockControlSchedule.findFirst.mockResolvedValue(sched);

      const result = await service.findOne(SCHEDULE_ID, TENANT_A);
      expect(result.data).toMatchObject({ id: SCHEDULE_ID });
    });

    it('scopes findFirst to both id and tenantId', async () => {
      mockControlSchedule.findFirst.mockResolvedValue(makeSchedule());

      await service.findOne(SCHEDULE_ID, TENANT_A);

      expect(mockControlSchedule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SCHEDULE_ID, tenantId: TENANT_A },
        }),
      );
    });

    it('throws NotFoundException when schedule not found', async () => {
      mockControlSchedule.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', TENANT_A)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when schedule belongs to another tenant', async () => {
      // Simulate tenant isolation: Prisma returns null because tenantId filter excludes it
      mockControlSchedule.findFirst.mockResolvedValue(null);

      await expect(service.findOne(SCHEDULE_ID, TENANT_B)).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    const baseDto = {
      templateId: TEMPLATE_ID,
      zoneId:     'zone-001',
      assigneeId: USER_ID,
      frequency:  'DAILY' as const,
      recurrence: BASE_RECURRENCE,
      timezone:   'Europe/Paris',
      startDate:  new Date('2025-06-01'),
      endDate:    undefined,
    };

    it('throws BadRequestException when template not found for tenant', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.create(baseDto, TENANT_A, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows system templates (tenantId = null)', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(makeTemplate({ tenantId: null }));
      mockControlSchedule.create.mockResolvedValue(makeSchedule());

      const result = await service.create(baseDto, TENANT_A, USER_ID);
      expect(result.data).toMatchObject({ id: SCHEDULE_ID });
    });

    it('creates schedule with correct tenantId and createdBy', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(makeTemplate());
      mockControlSchedule.create.mockResolvedValue(makeSchedule());

      await service.create(baseDto, TENANT_A, USER_ID);

      const { data } = mockControlSchedule.create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(data.tenantId).toBe(TENANT_A);
      expect(data.createdBy).toBe(USER_ID);
    });

    it('sets isActive: true on creation', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(makeTemplate());
      mockControlSchedule.create.mockResolvedValue(makeSchedule());

      await service.create(baseDto, TENANT_A, USER_ID);

      const { data } = mockControlSchedule.create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(data.isActive).toBe(true);
    });

    it('stores computed nextRunAt from RecurrenceEngine', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(makeTemplate());
      mockControlSchedule.create.mockResolvedValue(makeSchedule({ nextRunAt: NEXT_RUN }));
      mockGetNextOccurrence.mockReturnValue(NEXT_RUN);

      await service.create(baseDto, TENANT_A, USER_ID);

      const { data } = mockControlSchedule.create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(data.nextRunAt).toBe(NEXT_RUN);
    });

    it('stores null nextRunAt when engine returns null (schedule already expired)', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(makeTemplate());
      mockGetNextOccurrence.mockReturnValue(null);
      mockControlSchedule.create.mockResolvedValue(makeSchedule({ nextRunAt: null }));

      await service.create(baseDto, TENANT_A, USER_ID);

      const { data } = mockControlSchedule.create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(data.nextRunAt).toBeNull();
    });

    // ── Recurrence validation ────────────────────────────────────────────────

    it('throws BadRequestException for WEEKLY schedule without daysOfWeek', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(makeTemplate());

      await expect(
        service.create(
          { ...baseDto, frequency: 'WEEKLY', recurrence: { interval: 1, timeSlots: ['08:00'], advanceGenerateDays: 7 } },
          TENANT_A, USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts WEEKLY schedule with daysOfWeek provided', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(makeTemplate());
      mockControlSchedule.create.mockResolvedValue(makeSchedule({ frequency: 'WEEKLY' }));

      await expect(
        service.create(
          {
            ...baseDto,
            frequency:  'WEEKLY',
            recurrence: { interval: 1, timeSlots: ['08:00'], advanceGenerateDays: 7, daysOfWeek: [1, 3, 5] },
          },
          TENANT_A, USER_ID,
        ),
      ).resolves.toBeDefined();
    });

    it('throws BadRequestException for MONTHLY schedule without daysOfMonth', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(makeTemplate());

      await expect(
        service.create(
          { ...baseDto, frequency: 'MONTHLY', recurrence: { interval: 1, timeSlots: ['08:00'], advanceGenerateDays: 7 } },
          TENANT_A, USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for CUSTOM schedule without intervalUnit', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(makeTemplate());

      await expect(
        service.create(
          { ...baseDto, frequency: 'CUSTOM', recurrence: { interval: 4, timeSlots: ['00:00'], advanceGenerateDays: 1 } },
          TENANT_A, USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts CUSTOM schedule with intervalUnit: HOURS', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(makeTemplate());
      mockControlSchedule.create.mockResolvedValue(makeSchedule({ frequency: 'CUSTOM' }));

      await expect(
        service.create(
          {
            ...baseDto,
            frequency:  'CUSTOM',
            recurrence: { interval: 4, timeSlots: ['00:00'], advanceGenerateDays: 1, intervalUnit: 'HOURS' },
          },
          TENANT_A, USER_ID,
        ),
      ).resolves.toBeDefined();
    });
  });

  // ── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException when schedule not found for tenant', async () => {
      mockControlSchedule.findFirst.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { isActive: false }, TENANT_A),
      ).rejects.toThrow(NotFoundException);
    });

    it('does not update schedules belonging to another tenant', async () => {
      // Tenant B trying to update tenant A's schedule: findFirst returns null
      mockControlSchedule.findFirst.mockResolvedValue(null);

      await expect(
        service.update(SCHEDULE_ID, { isActive: false }, TENANT_B),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates assigneeId and nulls out groupId', async () => {
      mockControlSchedule.findFirst.mockResolvedValue(makeSchedule());
      mockControlSchedule.update.mockResolvedValue(makeSchedule());

      await service.update(SCHEDULE_ID, { assigneeId: 'user-002' }, TENANT_A);

      const { data } = mockControlSchedule.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(data.assigneeId).toBe('user-002');
      expect(data.groupId).toBeNull();
    });

    it('updates groupId and nulls out assigneeId', async () => {
      mockControlSchedule.findFirst.mockResolvedValue(makeSchedule());
      mockControlSchedule.update.mockResolvedValue(makeSchedule());

      await service.update(SCHEDULE_ID, { groupId: 'group-002' }, TENANT_A);

      const { data } = mockControlSchedule.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(data.groupId).toBe('group-002');
      expect(data.assigneeId).toBeNull();
    });

    it('re-computes nextRunAt when recurrence changes', async () => {
      mockControlSchedule.findFirst.mockResolvedValue(makeSchedule());
      mockControlSchedule.update.mockResolvedValue(makeSchedule());
      mockGetNextOccurrence.mockReturnValue(NEXT_RUN);

      await service.update(
        SCHEDULE_ID,
        { recurrence: { interval: 2, timeSlots: ['10:00'] } },
        TENANT_A,
      );

      expect(mockGetNextOccurrence).toHaveBeenCalledTimes(1);
      const { data } = mockControlSchedule.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(data.nextRunAt).toBe(NEXT_RUN);
    });

    it('does NOT re-compute nextRunAt when recurrence is not changed', async () => {
      mockControlSchedule.findFirst.mockResolvedValue(makeSchedule());
      mockControlSchedule.update.mockResolvedValue(makeSchedule());

      await service.update(SCHEDULE_ID, { isActive: false }, TENANT_A);

      expect(mockGetNextOccurrence).not.toHaveBeenCalled();
    });
  });

  // ── deactivate ───────────────────────────────────────────────────────────────

  describe('deactivate', () => {
    it('throws NotFoundException when schedule not found', async () => {
      mockControlSchedule.findFirst.mockResolvedValue(null);

      await expect(service.deactivate('nonexistent', TENANT_A)).rejects.toThrow(NotFoundException);
    });

    it('does not deactivate schedules belonging to another tenant', async () => {
      mockControlSchedule.findFirst.mockResolvedValue(null);

      await expect(service.deactivate(SCHEDULE_ID, TENANT_B)).rejects.toThrow(NotFoundException);
    });

    it('sets isActive=false and nextRunAt=null (soft delete)', async () => {
      mockControlSchedule.findFirst.mockResolvedValue(makeSchedule());
      mockControlSchedule.update.mockResolvedValue(makeSchedule({ isActive: false, nextRunAt: null }));

      await service.deactivate(SCHEDULE_ID, TENANT_A);

      expect(mockControlSchedule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isActive: false, nextRunAt: null },
        }),
      );
    });

    it('scopes the update to id + tenantId (prevents cross-tenant mutation)', async () => {
      mockControlSchedule.findFirst.mockResolvedValue(makeSchedule());
      mockControlSchedule.update.mockResolvedValue(makeSchedule({ isActive: false, nextRunAt: null }));

      await service.deactivate(SCHEDULE_ID, TENANT_A);

      expect(mockControlSchedule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SCHEDULE_ID, tenantId: TENANT_A },
        }),
      );
    });

    it('returns success message', async () => {
      mockControlSchedule.findFirst.mockResolvedValue(makeSchedule());
      mockControlSchedule.update.mockResolvedValue(makeSchedule({ isActive: false }));

      const result = await service.deactivate(SCHEDULE_ID, TENANT_A);
      expect(result.message).toMatch(/désactivé|deactivated/i);
    });
  });

  // ── previewOccurrences ───────────────────────────────────────────────────────

  describe('previewOccurrences', () => {
    it('throws NotFoundException when schedule not found', async () => {
      mockControlSchedule.findFirst.mockResolvedValue(null);

      await expect(service.previewOccurrences('nonexistent', TENANT_A)).rejects.toThrow(NotFoundException);
    });

    it('does not return occurrences for another tenant\'s schedule', async () => {
      mockControlSchedule.findFirst.mockResolvedValue(null);

      await expect(service.previewOccurrences(SCHEDULE_ID, TENANT_B)).rejects.toThrow(NotFoundException);
    });

    it('calls getOccurrencesInWindow with schedule frequency and config', async () => {
      const sched = makeSchedule({ frequency: 'WEEKLY', recurrenceJson: { ...BASE_RECURRENCE, daysOfWeek: [1] } });
      mockControlSchedule.findFirst.mockResolvedValue(sched);

      await service.previewOccurrences(SCHEDULE_ID, TENANT_A, 5);

      expect(mockGetOccurrencesInWindow).toHaveBeenCalledWith(
        'WEEKLY',
        { ...BASE_RECURRENCE, daysOfWeek: [1] },
        expect.any(Date),
        expect.any(Date),
        sched.startDate,
        null,
      );
    });

    it('caps results to the requested count', async () => {
      const tenDates = Array.from({ length: 10 }, (_, i) => new Date(`2025-06-0${i + 1}T08:00:00Z`));
      mockGetOccurrencesInWindow.mockReturnValue(tenDates);
      mockControlSchedule.findFirst.mockResolvedValue(makeSchedule());

      const result = await service.previewOccurrences(SCHEDULE_ID, TENANT_A, 3);

      expect((result.data as string[]).length).toBe(3);
    });

    it('returns occurrences as ISO strings', async () => {
      const dates = [new Date('2025-06-01T08:00:00Z'), new Date('2025-06-02T08:00:00Z')];
      mockGetOccurrencesInWindow.mockReturnValue(dates);
      mockControlSchedule.findFirst.mockResolvedValue(makeSchedule());

      const result = await service.previewOccurrences(SCHEDULE_ID, TENANT_A);

      const data = result.data as string[];
      expect(data[0]).toBe('2025-06-01T08:00:00.000Z');
      expect(data[1]).toBe('2025-06-02T08:00:00.000Z');
    });

    it('returns empty array when engine finds no occurrences', async () => {
      mockGetOccurrencesInWindow.mockReturnValue([]);
      mockControlSchedule.findFirst.mockResolvedValue(makeSchedule());

      const result = await service.previewOccurrences(SCHEDULE_ID, TENANT_A);
      expect(result.data).toEqual([]);
    });

    it('passes endDate to the engine when schedule has an endDate', async () => {
      const endDate = new Date('2025-12-31');
      mockControlSchedule.findFirst.mockResolvedValue(makeSchedule({ endDate }));

      await service.previewOccurrences(SCHEDULE_ID, TENANT_A);

      expect(mockGetOccurrencesInWindow).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.any(Date),
        expect.any(Date),
        expect.any(Date),
        endDate,
      );
    });
  });
});
