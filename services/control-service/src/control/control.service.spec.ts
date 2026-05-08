import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
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

const mockPrisma = {
  controlTemplate: mockControlTemplate,
  controlTask:     mockControlTask,
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID   = 'tenant-test-001';
const TEMPLATE_ID = 'template-id-001';
const TASK_ID     = 'task-id-001';

function makeTemplate(overrides: Partial<{
  id: string;
  tenantId: string | null;
  name: string;
  type: string;
}> = {}) {
  return {
    id:            overrides.id       ?? TEMPLATE_ID,
    tenantId:      overrides.tenantId ?? TENANT_ID,
    name:          overrides.name     ?? 'Contrôle température',
    type:          overrides.type     ?? 'TEMPERATURE',
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
  assigneeId: string;
  scheduledAt: Date;
}> = {}) {
  return {
    id:          overrides.id         ?? TASK_ID,
    tenantId:    overrides.tenantId   ?? TENANT_ID,
    templateId:  overrides.templateId ?? TEMPLATE_ID,
    status:      overrides.status     ?? 'PLANNED',
    assigneeId:  overrides.assigneeId ?? 'user-001',
    zoneId:      'zone-001',
    scheduledAt: overrides.scheduledAt ?? new Date('2025-05-03T09:00:00Z'),
    startedAt:   null,
    completedAt: null,
    notes:       null,
    resultJson:  null,
    createdAt:   new Date('2025-05-02T10:00:00Z'),
    updatedAt:   new Date('2025-05-02T10:00:00Z'),
    template:    { id: TEMPLATE_ID, name: 'Contrôle température', type: 'TEMPERATURE' },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ControlService', () => {
  let service: ControlService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ControlService,
        { provide: PrismaService, useValue: mockPrisma },
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

    it('applies type filter when provided', async () => {
      mockControlTemplate.findMany.mockResolvedValue([]);
      mockControlTemplate.count.mockResolvedValue(0);

      await service.findAllTemplates(TENANT_ID, { page: 1, limit: 20, type: 'TEMPERATURE' });

      expect(mockControlTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'TEMPERATURE' }),
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
        { name: 'Contrôle température', type: 'TEMPERATURE', checklistJson: ['Check 1'], frequency: 'DAILY' },
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
        { name: 'Test', type: 'HYGIENE', checklistJson: [], frequency: 'WEEKLY' },
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
      // so they won't be found when queried with a real tenantId → NotFoundException
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
      expect(updateData).not.toHaveProperty('type');
      expect(updateData).not.toHaveProperty('frequency');
    });
  });

  // ── deleteTemplate ───────────────────────────────────────────────────────────

  describe('deleteTemplate', () => {
    it('throws NotFoundException when template not found', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(null);

      await expect(service.deleteTemplate('bad-id', TENANT_ID)).rejects.toThrow(NotFoundException);
    });

    it('deletes the template and returns success message', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(makeTemplate());
      mockControlTemplate.delete.mockResolvedValue(undefined);

      const result = await service.deleteTemplate(TEMPLATE_ID, TENANT_ID);

      expect(mockControlTemplate.delete).toHaveBeenCalledWith({ where: { id: TEMPLATE_ID } });
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

    it('creates task with PLANNED status when template is valid', async () => {
      mockControlTemplate.findFirst.mockResolvedValue(makeTemplate());
      const task = makeTask();
      mockControlTask.create.mockResolvedValue(task);

      const scheduledAt = new Date('2025-05-05T09:00:00Z');
      await service.createTask(
        { templateId: TEMPLATE_ID, scheduledAt, assigneeId: 'user-1', zoneId: 'zone-1' },
        TENANT_ID,
      );

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

    it('accepts system templates (tenantId=null) when creating tasks', async () => {
      const systemTemplate = makeTemplate({ tenantId: null });
      mockControlTemplate.findFirst.mockResolvedValue(systemTemplate);
      mockControlTask.create.mockResolvedValue(makeTask());

      await expect(
        service.createTask(
          { templateId: TEMPLATE_ID, scheduledAt: new Date(), assigneeId: 'user-1', zoneId: 'zone-1' },
          TENANT_ID,
        ),
      ).resolves.not.toThrow();
    });
  });

  // ── updateTask ───────────────────────────────────────────────────────────────

  describe('updateTask', () => {
    it('throws NotFoundException when task not found for tenant', async () => {
      mockControlTask.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTask(TASK_ID, { status: 'COMPLETED' }, TENANT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates status when found', async () => {
      mockControlTask.findFirst.mockResolvedValue(makeTask());
      mockControlTask.update.mockResolvedValue(makeTask({ status: 'COMPLETED' }));

      await service.updateTask(TASK_ID, { status: 'COMPLETED' }, TENANT_ID);

      expect(mockControlTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TASK_ID },
          data:  expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });
  });

  // ── getStats ─────────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns 100% compliance when no tasks today', async () => {
      mockControlTask.count
        .mockResolvedValueOnce(0)  // todayTotal
        .mockResolvedValueOnce(0)  // todayCompleted
        .mockResolvedValueOnce(0); // openOverdue

      const result = await service.getStats(TENANT_ID);

      expect(result.data).toMatchObject({
        todayTotal:     0,
        todayCompleted: 0,
        complianceRate: 100,
      });
    });

    it('calculates compliance rate correctly with partial completions', async () => {
      mockControlTask.count
        .mockResolvedValueOnce(10) // todayTotal
        .mockResolvedValueOnce(8)  // todayCompleted (COMPLETED status)
        .mockResolvedValueOnce(2); // openOverdue

      const result = await service.getStats(TENANT_ID);

      expect(result.data).toMatchObject({
        todayTotal:     10,
        todayCompleted: 8,
        complianceRate: 80,
        openOverdue:    2,
      });
    });

    it('scopes today task counts to tenantId', async () => {
      mockControlTask.count.mockResolvedValue(0);

      await service.getStats(TENANT_ID);

      for (const call of mockControlTask.count.mock.calls as Array<[{ where: { tenantId: string } }]>) {
        expect(call[0].where.tenantId).toBe(TENANT_ID);
      }
    });

    it('rounds compliance rate to nearest integer', async () => {
      mockControlTask.count
        .mockResolvedValueOnce(3) // todayTotal
        .mockResolvedValueOnce(1) // todayCompleted → 33.33% → rounded to 33
        .mockResolvedValueOnce(0);

      const result = await service.getStats(TENANT_ID);

      expect(result.data.complianceRate).toBe(33);
    });

    it('includes overdue task count in response', async () => {
      mockControlTask.count
        .mockResolvedValueOnce(5)  // todayTotal
        .mockResolvedValueOnce(5)  // todayCompleted
        .mockResolvedValueOnce(3); // openOverdue

      const result = await service.getStats(TENANT_ID);

      expect(result.data.openOverdue).toBe(3);
    });
  });
});
