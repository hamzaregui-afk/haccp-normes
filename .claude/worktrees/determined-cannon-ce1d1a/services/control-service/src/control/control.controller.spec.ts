/**
 * control.controller.spec.ts
 *
 * Unit tests for ControlController — audit event emission on template and task
 * create / update / delete operations.
 *
 * Strategy:
 *  - Mock @haccp/shared-utils emitAuditEvent
 *  - Mock ControlService (no DB)
 *  - Mock DTO schemas (pass-through parse)
 *  - Instantiate ControlController directly (no NestJS DI overhead)
 */

jest.mock('@haccp/shared-utils', () => ({
  emitAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./dto/control.dto', () => ({
  CreateTemplateDtoSchema: { parse: (x: unknown) => x },
  UpdateTemplateDtoSchema: { parse: (x: unknown) => x },
  CreateTaskDtoSchema:     { parse: (x: unknown) => x },
  UpdateTaskDtoSchema:     { parse: (x: unknown) => x },
  TemplateQuerySchema:     { parse: (x: unknown) => x },
  TaskQuerySchema:         { parse: (x: unknown) => x },
}));

import { emitAuditEvent } from '@haccp/shared-utils';
import { ControlController } from './control.controller';
import type { JwtPayload } from '@haccp/shared-types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACTOR: JwtPayload = {
  sub:      'manager-001',
  email:    'manager@example.com',
  tenantId: 'tenant-abc',
  role:     'MANAGER',
};

const TEMPLATE_ID = 'tmpl-xyz-001';
const TASK_ID     = 'task-xyz-001';

const CREATED_TEMPLATE = { data: { id: TEMPLATE_ID, name: 'Cold Chain Check', type: 'TEMPERATURE' } };
const UPDATED_TEMPLATE = { data: { id: TEMPLATE_ID, name: 'Cold Chain Check v2' } };
const DELETED_TEMPLATE = { message: 'Template deleted' };

const CREATED_TASK = { data: { id: TASK_ID, templateId: TEMPLATE_ID } };
const UPDATED_TASK = { data: { id: TASK_ID, status: 'COMPLETED' } };

// ─── ControlService mock ──────────────────────────────────────────────────────

function makeControlServiceMock() {
  return {
    findAllTemplates: jest.fn().mockResolvedValue({ data: [] }),
    findOneTemplate:  jest.fn().mockResolvedValue({ data: CREATED_TEMPLATE }),
    createTemplate:   jest.fn().mockResolvedValue(CREATED_TEMPLATE),
    updateTemplate:   jest.fn().mockResolvedValue(UPDATED_TEMPLATE),
    deleteTemplate:   jest.fn().mockResolvedValue(DELETED_TEMPLATE),
    findAllTasks:     jest.fn().mockResolvedValue({ data: [] }),
    findOneTask:      jest.fn().mockResolvedValue({ data: CREATED_TASK }),
    createTask:       jest.fn().mockResolvedValue(CREATED_TASK),
    updateTask:       jest.fn().mockResolvedValue(UPDATED_TASK),
    getStats:         jest.fn().mockResolvedValue({ data: {} }),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ControlController audit integration', () => {
  let controller: ControlController;
  let controlService: ReturnType<typeof makeControlServiceMock>;

  beforeEach(() => {
    controlService = makeControlServiceMock();
    controller     = new ControlController(controlService as never);
    jest.clearAllMocks();
  });

  // ── createTemplate ─────────────────────────────────────────────────────────

  describe('createTemplate', () => {
    const dto = { name: 'Cold Chain Check', type: 'TEMPERATURE' };

    it('returns the created template', async () => {
      const result = await controller.createTemplate(dto, ACTOR);
      expect(result).toEqual(CREATED_TEMPLATE);
    });

    it('emits a CREATE audit event for resource "controls"', async () => {
      await controller.createTemplate(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId:   'manager-001',
          action:   'CREATE',
          resource: 'controls',
          tenantId: 'tenant-abc',
        }),
      );
    });

    it('sets resourceId from the created template id', async () => {
      await controller.createTemplate(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: TEMPLATE_ID }),
      );
    });

    it('includes name and type in audit payload', async () => {
      await controller.createTemplate(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ name: 'Cold Chain Check', type: 'TEMPERATURE' }),
        }),
      );
    });

    it('still returns template when audit fails silently', async () => {
      (emitAuditEvent as jest.Mock).mockRejectedValueOnce(new Error('down'));
      const result = await controller.createTemplate(dto, ACTOR);
      expect(result).toEqual(CREATED_TEMPLATE);
    });
  });

  // ── updateTemplate ─────────────────────────────────────────────────────────

  describe('updateTemplate', () => {
    it('emits an UPDATE audit event with correct resourceId', async () => {
      await controller.updateTemplate(TEMPLATE_ID, { name: 'v2' }, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:     'UPDATE',
          resource:   'controls',
          resourceId: TEMPLATE_ID,
          tenantId:   'tenant-abc',
        }),
      );
    });

    it('returns the updated template', async () => {
      const result = await controller.updateTemplate(TEMPLATE_ID, {}, ACTOR);
      expect(result).toEqual(UPDATED_TEMPLATE);
    });
  });

  // ── deleteTemplate ─────────────────────────────────────────────────────────

  describe('deleteTemplate', () => {
    it('emits a DELETE audit event with correct resourceId', async () => {
      await controller.deleteTemplate(TEMPLATE_ID, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:     'DELETE',
          resource:   'controls',
          resourceId: TEMPLATE_ID,
          tenantId:   'tenant-abc',
        }),
      );
    });

    it('returns the deleted template result', async () => {
      const result = await controller.deleteTemplate(TEMPLATE_ID, ACTOR);
      expect(result).toEqual(DELETED_TEMPLATE);
    });

    it('emits exactly one audit event', async () => {
      await controller.deleteTemplate(TEMPLATE_ID, ACTOR);
      await Promise.resolve();
      expect(emitAuditEvent).toHaveBeenCalledTimes(1);
    });
  });

  // ── createTask ─────────────────────────────────────────────────────────────

  describe('createTask', () => {
    const dto = { templateId: TEMPLATE_ID, scheduledFor: '2026-05-08T08:00:00Z' };

    it('returns the created task', async () => {
      const result = await controller.createTask(dto, ACTOR);
      expect(result).toEqual(CREATED_TASK);
    });

    it('emits a CREATE audit event for the task', async () => {
      await controller.createTask(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:   'CREATE',
          resource: 'controls',
          tenantId: 'tenant-abc',
        }),
      );
    });

    it('sets resourceId from the created task id', async () => {
      await controller.createTask(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: TASK_ID }),
      );
    });
  });

  // ── updateTask ─────────────────────────────────────────────────────────────

  describe('updateTask', () => {
    it('emits an UPDATE audit event with correct resourceId', async () => {
      await controller.updateTask(TASK_ID, { status: 'COMPLETED' }, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:     'UPDATE',
          resource:   'controls',
          resourceId: TASK_ID,
          tenantId:   'tenant-abc',
        }),
      );
    });

    it('includes status in audit payload (critical HACCP event)', async () => {
      await controller.updateTask(TASK_ID, { status: 'COMPLETED' }, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('returns the updated task', async () => {
      const result = await controller.updateTask(TASK_ID, { status: 'COMPLETED' }, ACTOR);
      expect(result).toEqual(UPDATED_TASK);
    });

    it('emits exactly one audit event per task update', async () => {
      await controller.updateTask(TASK_ID, {}, ACTOR);
      await Promise.resolve();
      expect(emitAuditEvent).toHaveBeenCalledTimes(1);
    });
  });
});
