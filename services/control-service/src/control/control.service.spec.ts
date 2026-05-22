import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { ControlService } from './control.service';

// ── Prisma mock ───────────────────────────────────────────────────────────────

const mockControlTemplate = {
  findMany:  jest.fn(),
  count:     jest.fn(),
  create:    jest.fn(),
  findFirst: jest.fn(),
  update:    jest.fn(),
  delete:    jest.fn(),
};

const mockControlTask = {
  findMany:  jest.fn(),
  count:     jest.fn(),
  create:    jest.fn(),
  findFirst: jest.fn(),
  update:    jest.fn(),
};

const mockOutboxEvent = {
  // Default resolved value survives jest.clearAllMocks() (clearAllMocks only wipes
  // calls/results, not implementations set via mockResolvedValue/mockImplementation).
  create: jest.fn().mockResolvedValue({ id: 'evt-001' }),
};

const mockPrisma = {
  controlTemplate: mockControlTemplate,
  controlTask:     mockControlTask,
  outboxEvent:     mockOutboxEvent,
  // ARCH-DECISION: $transaction receives an array of Prisma promises. In tests we
  // resolve them all concurrently with Promise.all — this preserves the positional
  // destructuring the service relies on without spinning up a real DB transaction.
  $transaction: jest.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
};

// ── MinioService mock ─────────────────────────────────────────────────────────

const mockMinio = {
  upload:          jest.fn(),
  presignedGetUrl: jest.fn(),
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID   = 'tenant-test-001';
const TEMPLATE_ID = 'template-id-001';
const TASK_ID     = 'task-id-001';

function makeTemplate(overrides: Partial<{
  id: string;
  tenantId: string | null;
  name: string;
}> = {}) {
  return {
    id:            overrides.id       ?? TEMPLATE_ID,
    tenantId:      overrides.tenantId ?? TENANT_ID,
    name:          overrides.name     ?? 'Contrôle température',
    checklistJson: ['Vérifier affichage', 'Enregistrer valeur'],
    frequency:     'DAILY',
    createdAt:     new Date('2025-01-01T08:00:00Z'),
    updatedAt:     new Date('2025-01-01T08:00:00Z'),
  };
}

function makeTask(overrides: Partial<{
  id: string;
  tenantId: string;
  templateId: string;
  status: string;
  assigneeId: string | null;
  startedAt: Date | null;
  scheduledAt: Date;
}> = {}) {
  return {
    id:          overrides.id         ?? TASK_ID,
    tenantId:    overrides.tenantId   ?? TENANT_ID,
    templateId:  overrides.templateId ?? TEMPLATE_ID,
    status:      overrides.status     ?? 'PLANNED',
    assigneeId:  overrides.assigneeId !== undefined ? overrides.assigneeId : 'user-001',
    groupId:     null,
    zoneId:      'zone-001',
    scheduledAt: overrides.scheduledAt ?? new Date('2025-05-03T09:00:00Z'),
    startedAt:   overrides.startedAt  !== undefined ? overrides.startedAt : null,
    completedAt: null,
    notes:       null,
    resultJson:  null,
    createdAt:   new Date('2025-05-02T10:00:00Z'),
    updatedAt:   new Date('2025-05-02T10:00:00Z'),
    template:    { id: TEMPLATE_ID, name: 'Contrôle température' },
  };
}

const RESULT_JSON_COMPLIANT = {
  submittedAt: '2025-05-03T10:00:00Z',
  submittedBy: 'user-001',
  overallCompliant: true,
  items: [],
};

const RESULT_JSON_NC = {
  submittedAt: '2025-05-03T10:00:00Z',
  submittedBy: 'user-001',
  overallCompliant: false,
  ncComment: 'Température trop élevée',
  items: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ControlService', () => {
  let service: ControlService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ControlService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MinioService,  useValue: mockMinio  },
      ],
    }).compile();

    service = module.get<ControlService>(ControlService);
    jest.clearAllMocks();
  });

  // ── findAllTemplates ─────────────────────────────────────────────────────────

  describe('findAllTemplates', () => {
    it('includes both tenant-specific and system (tenantId=null) templates via OR', async () => {
      mockControlTemplate.findMany.mockResolvedValue([]);
      mockControlTemplate.count.mockResolvedValue(0);

      await service.findAllTemplates(TENANT_ID, { page: 1, limit: 20 });

      expect(mockControlTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { tenantId: TENANT_ID },
              { tenantId: null },
            ]),
          }),
        }),
      );
    });

    it('applies name search filter when provided', async () => {
      mockControlTemplate.findMany.mockResolvedValue([]);
      mockControlTemplate.count.mockResolvedValue(0);

      await service.findAllTemplates(TENANT_ID, { page: 1, limit: 20, search: 'frigo' });

      expect(mockControlTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: expect.objectContaining({ contains: 'frigo', mode: 'insensitive' }),
          }),
        }),
      );
    });

    it('returns paginated result with correct meta', async () => {
      const templates = [makeTemplate(), makeTemplate({ id: 'tpl-002' })];
      mockControlTemplate.findMany.mockResolvedValue(templates);
      mockControlTemplate.count.mockResolvedValue(2);

      const result = await service.findAllTemplates(TENANT_ID, { page: 1, limit: 10 });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toMatchObject({ total: 2, page: 1, limit: 10, lastPage: 1 });
    });

    it('applies skip offset for pagination', async () => {
      mockControlTemplate.findMany.mockResolvedValue([]);
      mockControlTemplate.count.mockResolvedValue(0);

      await service.findAllTemplates(TENANT_ID, { page: 2, limit: 5 });

      expect(mockControlTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });
  });

  // ── findOneTemplate ──────────────────────────────────────────────────────────

  describe('findOneTemplate', () => {
    it('returns template when found for tenant or as system template', async () => {
      const tpl = makeTemplate();
      mockControlTemplate.findFirst.mockResolvedValue(tpl);

      const result = await service.findOneTemplate(TEMPLATE_ID, TENANT_ID);

      expect(result.data).toMatchObject({ id: TEMPLATE_ID });
      expect(mockControlTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: TEMPLATE_ID,
            OR: [{ tenantId: TENANT_ID }, { tenantId: null }],
          },
        }),
      );
    });

    it('throws NotFoundException when template not found', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(null);

      await expect(service.findOneTemplate('bad-id', TENANT_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── createTemplate ───────────────────────────────────────────────────────────

  describe('createTemplate', () => {
    it('creates template scoped to tenantId', async () => {
      const tpl = makeTemplate();
      mockControlTemplate.create.mockResolvedValue(tpl);

      await service.createTemplate(
        { name: 'Contrôle température', checklistJson: ['Check 1'], frequency: 'DAILY' },
        TENANT_ID,
      );

      expect(mockControlTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: TENANT_ID }),
        }),
      );
    });

    it('returns success message after creation', async () => {
      mockControlTemplate.create.mockResolvedValue(makeTemplate());

      const result = await service.createTemplate(
        { name: 'Test', checklistJson: [], frequency: 'WEEKLY' },
        TENANT_ID,
      );

      expect(result.message).toBe('Modèle créé');
    });
  });

  // ── updateTemplate ───────────────────────────────────────────────────────────

  describe('updateTemplate', () => {
    it('throws NotFoundException when template not found for tenant', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTemplate(TEMPLATE_ID, { name: 'Updated' }, TENANT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('does not allow updating system templates (tenantId=null)', async () => {
      // findFirst looks for { id, tenantId } — system templates have tenantId=null
      // so they won't match a real tenantId query → NotFoundException
      mockControlTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTemplate('system-tpl-id', { name: 'Hacked' }, TENANT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates only provided fields (partial update)', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(makeTemplate());
      const updated = makeTemplate({ name: 'Renamed' });
      mockControlTemplate.update.mockResolvedValue(updated);

      await service.updateTemplate(TEMPLATE_ID, { name: 'Renamed' }, TENANT_ID);

      const updateData = (mockControlTemplate.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      }).data;
      expect(updateData).toHaveProperty('name', 'Renamed');
      expect(updateData).not.toHaveProperty('frequency');
    });
  });

  // ── deleteTemplate ───────────────────────────────────────────────────────────

  describe('deleteTemplate', () => {
    it('throws NotFoundException when template not found', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(null);

      await expect(service.deleteTemplate('bad-id', TENANT_ID)).rejects.toThrow(NotFoundException);
    });

    it('deletes the template scoped to tenantId and returns success message', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(makeTemplate());
      mockControlTemplate.delete.mockResolvedValue(undefined);

      const result = await service.deleteTemplate(TEMPLATE_ID, TENANT_ID);

      // tenantId in where clause is defence-in-depth (matches service implementation)
      expect(mockControlTemplate.delete).toHaveBeenCalledWith({
        where: { id: TEMPLATE_ID, tenantId: TENANT_ID },
      });
      expect(result.message).toBe('Modèle supprimé');
    });
  });

  // ── findAllTasks ─────────────────────────────────────────────────────────────

  describe('findAllTasks', () => {
    it('scopes tasks to tenantId', async () => {
      mockControlTask.findMany.mockResolvedValue([]);
      mockControlTask.count.mockResolvedValue(0);

      await service.findAllTasks(TENANT_ID, { page: 1, limit: 20 });

      expect(mockControlTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID }),
        }),
      );
    });

    it('applies status filter when provided', async () => {
      mockControlTask.findMany.mockResolvedValue([]);
      mockControlTask.count.mockResolvedValue(0);

      await service.findAllTasks(TENANT_ID, { page: 1, limit: 20, status: 'COMPLETED' });

      expect(mockControlTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('applies date range filter (from/to) on scheduledAt', async () => {
      mockControlTask.findMany.mockResolvedValue([]);
      mockControlTask.count.mockResolvedValue(0);

      const from = new Date('2025-05-01T00:00:00Z');
      const to   = new Date('2025-05-31T23:59:59Z');

      await service.findAllTasks(TENANT_ID, { page: 1, limit: 20, from, to });

      expect(mockControlTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            scheduledAt: { gte: from, lte: to },
          }),
        }),
      );
    });

    it('orders by scheduledAt ascending', async () => {
      mockControlTask.findMany.mockResolvedValue([]);
      mockControlTask.count.mockResolvedValue(0);

      await service.findAllTasks(TENANT_ID, { page: 1, limit: 20 });

      expect(mockControlTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { scheduledAt: 'asc' } }),
      );
    });
  });

  // ── createTask ───────────────────────────────────────────────────────────────

  describe('createTask', () => {
    it('throws NotFoundException when template not accessible for tenant', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.createTask(
          { templateId: 'bad-tpl', scheduledAt: new Date(), assigneeId: 'user-1', zoneId: 'zone-1' },
          TENANT_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates task via $transaction with PLANNED status', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(makeTemplate());
      mockControlTask.create.mockResolvedValue(makeTask());
      mockOutboxEvent.create.mockResolvedValue({ id: 'evt-001' });

      const scheduledAt = new Date('2025-05-05T09:00:00Z');
      await service.createTask(
        { templateId: TEMPLATE_ID, scheduledAt, assigneeId: 'user-1', zoneId: 'zone-1' },
        TENANT_ID,
      );

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockControlTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            templateId: TEMPLATE_ID,
            tenantId:   TENANT_ID,
            status:     'PLANNED',
            scheduledAt,
          }),
        }),
      );
    });

    it('freezes checklistJson as checklistSnapshot at creation time', async () => {
      const template = makeTemplate();
      mockControlTemplate.findFirst.mockResolvedValue(template);
      mockControlTask.create.mockResolvedValue(makeTask());
      mockOutboxEvent.create.mockResolvedValue({ id: 'evt-001' });

      await service.createTask(
        { templateId: TEMPLATE_ID, scheduledAt: new Date(), assigneeId: 'user-1', zoneId: 'zone-1' },
        TENANT_ID,
      );

      // ARCH-DECISION: snapshot is taken at creation so inspectors always see
      // the checklist that was active at the time the task was scheduled.
      expect(mockControlTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            checklistSnapshot: template.checklistJson,
          }),
        }),
      );
    });

    it('writes outbox event control.task.assigned.v1 when assigneeId is provided', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(makeTemplate());
      mockControlTask.create.mockResolvedValue(makeTask());
      mockOutboxEvent.create.mockResolvedValue({ id: 'evt-001' });

      await service.createTask(
        { templateId: TEMPLATE_ID, scheduledAt: new Date(), assigneeId: 'user-1', zoneId: 'zone-1' },
        TENANT_ID,
      );

      expect(mockOutboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'control.task.assigned.v1',
            tenantId:  TENANT_ID,
          }),
        }),
      );
    });

    it('skips outbox event when neither assigneeId nor groupId is provided', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(makeTemplate());
      mockControlTask.create.mockResolvedValue({ ...makeTask(), assigneeId: null, groupId: null });

      await service.createTask(
        { templateId: TEMPLATE_ID, scheduledAt: new Date(), zoneId: 'zone-1' },
        TENANT_ID,
      );

      expect(mockOutboxEvent.create).not.toHaveBeenCalled();
    });

    it('accepts system templates (tenantId=null) when creating tasks', async () => {
      const systemTemplate = makeTemplate({ tenantId: null });
      mockControlTemplate.findFirst.mockResolvedValue(systemTemplate);
      mockControlTask.create.mockResolvedValue(makeTask());
      mockOutboxEvent.create.mockResolvedValue({ id: 'evt-001' });

      await expect(
        service.createTask(
          { templateId: TEMPLATE_ID, scheduledAt: new Date(), assigneeId: 'user-1', zoneId: 'zone-1' },
          TENANT_ID,
        ),
      ).resolves.not.toThrow();
    });
  });

  // ── updateTask — basic ───────────────────────────────────────────────────────

  describe('updateTask', () => {
    it('throws NotFoundException when task not found for tenant', async () => {
      mockControlTask.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTask(TASK_ID, { status: 'IN_PROGRESS' }, TENANT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates task via $transaction and scopes where to tenantId', async () => {
      mockControlTask.findFirst.mockResolvedValue(makeTask({ status: 'PLANNED' }));
      mockControlTask.update.mockResolvedValue(makeTask({ status: 'IN_PROGRESS' }));

      await service.updateTask(TASK_ID, { status: 'IN_PROGRESS' }, TENANT_ID);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockControlTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TASK_ID, tenantId: TENANT_ID },
          data:  expect.objectContaining({ status: 'IN_PROGRESS' }),
        }),
      );
    });
  });

  // ── updateTask — VALID_TRANSITIONS state machine ─────────────────────────────

  describe('updateTask — VALID_TRANSITIONS state machine', () => {
    it.each([
      ['PLANNED',     'IN_PROGRESS'],
      ['PLANNED',     'CANCELLED'],
      ['PLANNED',     'OVERDUE'],
      ['PLANNED',     'COMPLETED'],
      ['IN_PROGRESS', 'COMPLETED'],
      ['IN_PROGRESS', 'CANCELLED'],
      ['OVERDUE',     'IN_PROGRESS'],
      ['OVERDUE',     'CANCELLED'],
      ['OVERDUE',     'COMPLETED'],
    ])('allows %s → %s transition', async (fromStatus, toStatus) => {
      mockControlTask.findFirst.mockResolvedValue(makeTask({ status: fromStatus }));
      mockControlTask.update.mockResolvedValue(makeTask({ status: toStatus }));
      mockOutboxEvent.create.mockResolvedValue({ id: 'evt-001' });

      await expect(
        service.updateTask(TASK_ID, { status: toStatus } as never, TENANT_ID),
      ).resolves.not.toThrow();
    });

    it.each([
      ['COMPLETED',   'IN_PROGRESS'],
      ['COMPLETED',   'PLANNED'],
      ['COMPLETED',   'OVERDUE'],
      ['CANCELLED',   'PLANNED'],
      ['CANCELLED',   'IN_PROGRESS'],
      ['CANCELLED',   'COMPLETED'],
      ['IN_PROGRESS', 'PLANNED'],
      ['IN_PROGRESS', 'OVERDUE'],
      ['OVERDUE',     'PLANNED'],
    ])('blocks %s → %s transition with BadRequestException', async (fromStatus, toStatus) => {
      mockControlTask.findFirst.mockResolvedValue(makeTask({ status: fromStatus }));

      await expect(
        service.updateTask(TASK_ID, { status: toStatus } as never, TENANT_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('includes from/to statuses in the BadRequestException message', async () => {
      mockControlTask.findFirst.mockResolvedValue(makeTask({ status: 'COMPLETED' }));

      await expect(
        service.updateTask(TASK_ID, { status: 'IN_PROGRESS' } as never, TENANT_ID),
      ).rejects.toThrow('COMPLETED → IN_PROGRESS');
    });
  });

  // ── updateTask — auto-timestamps on direct completion ────────────────────────

  describe('updateTask — auto-timestamps on direct completion', () => {
    function getUpdateData(): Record<string, unknown> {
      return (mockControlTask.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    }

    it('auto-sets startedAt and completedAt when PLANNED → COMPLETED (both null)', async () => {
      mockControlTask.findFirst.mockResolvedValue(makeTask({ status: 'PLANNED' })); // startedAt: null
      mockControlTask.update.mockResolvedValue(makeTask({ status: 'COMPLETED' }));
      mockOutboxEvent.create.mockResolvedValue({ id: 'evt-001' });

      await service.updateTask(TASK_ID, { status: 'COMPLETED', resultJson: RESULT_JSON_COMPLIANT as never }, TENANT_ID);

      const data = getUpdateData();
      expect(data.startedAt).toBeInstanceOf(Date);
      expect(data.completedAt).toBeInstanceOf(Date);
    });

    it('auto-sets startedAt and completedAt when OVERDUE → COMPLETED (startedAt null)', async () => {
      mockControlTask.findFirst.mockResolvedValue(makeTask({ status: 'OVERDUE', startedAt: null }));
      mockControlTask.update.mockResolvedValue(makeTask({ status: 'COMPLETED' }));
      mockOutboxEvent.create.mockResolvedValue({ id: 'evt-001' });

      await service.updateTask(TASK_ID, { status: 'COMPLETED', resultJson: RESULT_JSON_COMPLIANT as never }, TENANT_ID);

      const data = getUpdateData();
      expect(data.startedAt).toBeInstanceOf(Date);
      expect(data.completedAt).toBeInstanceOf(Date);
    });

    it('does NOT override startedAt when OVERDUE task already has startedAt set', async () => {
      const alreadyStarted = makeTask({ status: 'OVERDUE', startedAt: new Date('2025-05-03T08:00:00Z') });
      mockControlTask.findFirst.mockResolvedValue(alreadyStarted);
      mockControlTask.update.mockResolvedValue(makeTask({ status: 'COMPLETED' }));
      mockOutboxEvent.create.mockResolvedValue({ id: 'evt-001' });

      await service.updateTask(TASK_ID, { status: 'COMPLETED', resultJson: RESULT_JSON_COMPLIANT as never }, TENANT_ID);

      const data = getUpdateData();
      // startedAt already existed — service must not override it
      expect(data.startedAt).toBeUndefined();
      expect(data.completedAt).toBeInstanceOf(Date);
    });

    it('sets only completedAt (not startedAt) when IN_PROGRESS → COMPLETED', async () => {
      const inProgress = makeTask({ status: 'IN_PROGRESS', startedAt: new Date('2025-05-03T09:00:00Z') });
      mockControlTask.findFirst.mockResolvedValue(inProgress);
      mockControlTask.update.mockResolvedValue(makeTask({ status: 'COMPLETED' }));
      mockOutboxEvent.create.mockResolvedValue({ id: 'evt-001' });

      await service.updateTask(TASK_ID, { status: 'COMPLETED', resultJson: RESULT_JSON_COMPLIANT as never }, TENANT_ID);

      const data = getUpdateData();
      // IN_PROGRESS is not a direct-complete path → startedAt must not be auto-set
      expect(data.startedAt).toBeUndefined();
      expect(data.completedAt).toBeInstanceOf(Date);
    });

    it('writes outbox event control.task.completed.v1 on COMPLETED transition', async () => {
      mockControlTask.findFirst.mockResolvedValue(makeTask({ status: 'PLANNED' }));
      mockControlTask.update.mockResolvedValue(makeTask({ status: 'COMPLETED' }));
      mockOutboxEvent.create.mockResolvedValue({ id: 'evt-001' });

      await service.updateTask(TASK_ID, { status: 'COMPLETED', resultJson: RESULT_JSON_COMPLIANT as never }, TENANT_ID);

      expect(mockOutboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'control.task.completed.v1',
            tenantId:  TENANT_ID,
          }),
        }),
      );
    });

    it('does not write outbox event for non-completing transitions', async () => {
      mockControlTask.findFirst.mockResolvedValue(makeTask({ status: 'PLANNED' }));
      mockControlTask.update.mockResolvedValue(makeTask({ status: 'IN_PROGRESS' }));

      await service.updateTask(TASK_ID, { status: 'IN_PROGRESS' }, TENANT_ID);

      expect(mockOutboxEvent.create).not.toHaveBeenCalled();
    });
  });

  // ── getStats ─────────────────────────────────────────────────────────────────

  describe('getStats', () => {
    // Helper: sets up the 4 Promise.all count calls in declaration order.
    // ARCH-DECISION: getStats uses Promise.all with 4 concurrent count queries.
    // jest.fn().mockResolvedValueOnce is queue-based and consumed in call order,
    // which matches the order in the Promise.all array (synchronous initiation).
    function mockCounts(todayTotal: number, todayCompleted: number, openOverdue: number, ncThisMonth: number) {
      mockControlTask.count
        .mockResolvedValueOnce(todayTotal)
        .mockResolvedValueOnce(todayCompleted)
        .mockResolvedValueOnce(openOverdue)
        .mockResolvedValueOnce(ncThisMonth);
    }

    it('returns 100% compliance when no tasks today', async () => {
      mockCounts(0, 0, 0, 0);

      const result = await service.getStats(TENANT_ID);

      expect(result.data).toMatchObject({
        todayTotal:     0,
        todayCompleted: 0,
        complianceRate: 100,
      });
    });

    it('calculates compliance rate correctly with partial completions', async () => {
      mockCounts(10, 8, 2, 0);

      const result = await service.getStats(TENANT_ID);

      expect(result.data).toMatchObject({
        todayTotal:     10,
        todayCompleted: 8,
        complianceRate: 80,
        openOverdue:    2,
      });
    });

    it('scopes all four count queries to tenantId', async () => {
      mockCounts(0, 0, 0, 0);

      await service.getStats(TENANT_ID);

      for (const call of mockControlTask.count.mock.calls as Array<[{ where: { tenantId: string } }]>) {
        expect(call[0].where.tenantId).toBe(TENANT_ID);
      }
    });

    it('rounds compliance rate to nearest integer', async () => {
      mockCounts(3, 1, 0, 0); // 1/3 = 33.33% → 33

      const result = await service.getStats(TENANT_ID);

      expect(result.data.complianceRate).toBe(33);
    });

    it('includes overdue task count in response', async () => {
      mockCounts(5, 5, 3, 0);

      const result = await service.getStats(TENANT_ID);

      expect(result.data.openOverdue).toBe(3);
    });

    it('returns ncControlsThisMonth from the 4th count query', async () => {
      mockCounts(10, 10, 0, 4);

      const result = await service.getStats(TENANT_ID);

      expect(result.data.ncControlsThisMonth).toBe(4);
    });

    it('returns 0 ncControlsThisMonth when no NC controls exist this month', async () => {
      mockCounts(5, 5, 0, 0);

      const result = await service.getStats(TENANT_ID);

      expect(result.data.ncControlsThisMonth).toBe(0);
    });

    it('queries ncControlsThisMonth with COMPLETED status and overallCompliant: false filter', async () => {
      mockCounts(0, 0, 0, 0);

      await service.getStats(TENANT_ID);

      // 4th call (index 3) — ncControlsThisMonth
      const ncCall = mockControlTask.count.mock.calls[3] as [{ where: Record<string, unknown> }];
      expect(ncCall[0].where).toMatchObject({
        status:     'COMPLETED',
        resultJson: { path: ['overallCompliant'], equals: false },
      });
    });
  });

  // ── getRecentNcControls ───────────────────────────────────────────────────────

  describe('getRecentNcControls', () => {
    const ncTask = {
      id:          'nc-task-001',
      zoneId:      'zone-001',
      completedAt: new Date('2025-05-03T10:00:00Z'),
      resultJson:  RESULT_JSON_NC,
      template:    { id: TEMPLATE_ID, name: 'Contrôle température' },
    };

    it('scopes query to tenantId', async () => {
      mockControlTask.findMany.mockResolvedValue([]);

      await service.getRecentNcControls(TENANT_ID);

      expect(mockControlTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID }),
        }),
      );
    });

    it('filters for COMPLETED tasks with overallCompliant: false', async () => {
      mockControlTask.findMany.mockResolvedValue([]);

      await service.getRecentNcControls(TENANT_ID);

      expect(mockControlTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status:     'COMPLETED',
            resultJson: { path: ['overallCompliant'], equals: false },
          }),
        }),
      );
    });

    it('orders by completedAt descending (most recent first)', async () => {
      mockControlTask.findMany.mockResolvedValue([]);

      await service.getRecentNcControls(TENANT_ID);

      expect(mockControlTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { completedAt: 'desc' } }),
      );
    });

    it('limits results to 10 NC controls', async () => {
      mockControlTask.findMany.mockResolvedValue([]);

      await service.getRecentNcControls(TENANT_ID);

      expect(mockControlTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });

    it('returns wrapped ApiResponse with data array', async () => {
      mockControlTask.findMany.mockResolvedValue([ncTask]);

      const result = await service.getRecentNcControls(TENANT_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ id: 'nc-task-001' });
    });

    it('returns empty array when no NC controls exist', async () => {
      mockControlTask.findMany.mockResolvedValue([]);

      const result = await service.getRecentNcControls(TENANT_ID);

      expect(result.data).toEqual([]);
    });
  });
});
