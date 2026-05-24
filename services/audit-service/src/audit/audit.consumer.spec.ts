/**
 * audit.consumer.spec.ts
 *
 * Unit tests for AuditConsumer — the RabbitMQ domain-event handler that writes
 * immutable audit log entries.
 *
 * Strategy:
 *  - Mock AuditService so no DB is needed.
 *  - Call handler methods directly (bypass NestJS IoC + RabbitMQ transport).
 *  - Verify the correct log() arguments for each event type.
 *  - Verify IdempotencyGuard prevents duplicate writes.
 *  - Verify write errors are swallowed (handler never throws).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AuditConsumer } from './audit.consumer';
import { AuditService } from './audit.service';

// ─── Mock AuditService ────────────────────────────────────────────────────────

const mockLog = jest.fn().mockResolvedValue({ data: { id: 'audit-001' } });

const mockAuditService = { log: mockLog };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEnvelope(
  eventId = 'evt-001',
  payload: Record<string, unknown> = {},
): Parameters<AuditConsumer['handleNcCreated']>[0] {
  return {
    tenantId:      'tenant-abc',
    payload,
    eventId,
    correlationId: 'cid-001',
    timestamp:     '2026-05-07T10:00:00.000Z',
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('AuditConsumer', () => {
  let consumer: AuditConsumer;

  beforeEach(async () => {
    mockLog.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditConsumer,
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    consumer = module.get<AuditConsumer>(AuditConsumer);
  });

  // ── handleNcCreated ───────────────────────────────────────────────────────

  describe('handleNcCreated', () => {
    it('logs a CREATE / nonconformities entry with createdBy as userId', async () => {
      const data = makeEnvelope('evt-nc-001', {
        ncId:      'nc-001',
        severity:  'HIGH',
        createdBy: 'operator-001',
      });

      consumer.handleNcCreated(data);
      await new Promise((r) => setTimeout(r, 10)); // let void promise settle

      expect(mockLog).toHaveBeenCalledTimes(1);
      const [dto, tenantId] = mockLog.mock.calls[0] as [Record<string, unknown>, string];
      expect(tenantId).toBe('tenant-abc');
      expect(dto['action']).toBe('CREATE');
      expect(dto['resource']).toBe('nonconformities');
      expect(dto['resourceId']).toBe('nc-001');
      expect(dto['userId']).toBe('operator-001');
    });

    it("defaults userId to 'system' when createdBy is absent", async () => {
      const data = makeEnvelope('evt-nc-002', { ncId: 'nc-002' });
      consumer.handleNcCreated(data);
      await new Promise((r) => setTimeout(r, 10));

      const [dto] = mockLog.mock.calls[0] as [Record<string, unknown>, string];
      expect(dto['userId']).toBe('system');
    });
  });

  // ── handleTaskCompleted ───────────────────────────────────────────────────

  describe('handleTaskCompleted', () => {
    it('logs an UPDATE / controls entry with completedBy as userId', async () => {
      const data = makeEnvelope('evt-task-001', {
        taskId:      'task-001',
        completedBy: 'operator-002',
      });

      consumer.handleTaskCompleted(data);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockLog).toHaveBeenCalledTimes(1);
      const [dto] = mockLog.mock.calls[0] as [Record<string, unknown>, string];
      expect(dto['action']).toBe('UPDATE');
      expect(dto['resource']).toBe('controls');
      expect(dto['resourceId']).toBe('task-001');
      expect(dto['userId']).toBe('operator-002');
    });
  });

  // ── handleTaskAssigned ────────────────────────────────────────────────────

  describe('handleTaskAssigned', () => {
    it('logs an UPDATE / controls entry; assigneeId becomes userId', async () => {
      const data = makeEnvelope('evt-assign-001', {
        taskId:     'task-002',
        assigneeId: 'operator-003',
      });

      consumer.handleTaskAssigned(data);
      await new Promise((r) => setTimeout(r, 10));

      const [dto] = mockLog.mock.calls[0] as [Record<string, unknown>, string];
      expect(dto['action']).toBe('UPDATE');
      expect(dto['resource']).toBe('controls');
      expect(dto['userId']).toBe('operator-003');
    });

    it("uses 'system' when assigneeId is null (group-only assignment)", async () => {
      const data = makeEnvelope('evt-assign-002', {
        taskId:     'task-003',
        assigneeId: null,
        groupId:    'grp-001',
      });

      consumer.handleTaskAssigned(data);
      await new Promise((r) => setTimeout(r, 10));

      const [dto] = mockLog.mock.calls[0] as [Record<string, unknown>, string];
      expect(dto['userId']).toBe('system');
    });
  });

  // ── handleTasksOverdue ────────────────────────────────────────────────────

  describe('handleTasksOverdue', () => {
    it('logs an UPDATE / controls entry with userId=system', async () => {
      const data = makeEnvelope('evt-overdue-001', {
        count:   3,
        taskIds: ['t1', 't2', 't3'],
      });

      consumer.handleTasksOverdue(data);
      await new Promise((r) => setTimeout(r, 10));

      const [dto] = mockLog.mock.calls[0] as [Record<string, unknown>, string];
      expect(dto['action']).toBe('UPDATE');
      expect(dto['resource']).toBe('controls');
      expect(dto['userId']).toBe('system');
      expect(dto['resourceId']).toBeUndefined();
    });
  });

  // ── handleReportValidated ─────────────────────────────────────────────────

  describe('handleReportValidated', () => {
    it('logs an UPDATE / reports entry with validatedBy as userId', async () => {
      const data = makeEnvelope('evt-report-001', {
        reportId:    'report-001',
        validatedBy: 'manager-001',
      });

      consumer.handleReportValidated(data);
      await new Promise((r) => setTimeout(r, 10));

      const [dto] = mockLog.mock.calls[0] as [Record<string, unknown>, string];
      expect(dto['action']).toBe('UPDATE');
      expect(dto['resource']).toBe('reports');
      expect(dto['resourceId']).toBe('report-001');
      expect(dto['userId']).toBe('manager-001');
    });
  });

  // ── handleDlcExpiring ─────────────────────────────────────────────────────

  describe('handleDlcExpiring', () => {
    it('logs a CREATE / system entry', async () => {
      const data = makeEnvelope('evt-dlc-001', { count: 4 });
      consumer.handleDlcExpiring(data);
      await new Promise((r) => setTimeout(r, 10));

      const [dto] = mockLog.mock.calls[0] as [Record<string, unknown>, string];
      expect(dto['action']).toBe('CREATE');
      expect(dto['resource']).toBe('system');
      expect(dto['userId']).toBe('system');
    });
  });

  // ── Idempotency ───────────────────────────────────────────────────────────

  describe('deduplication', () => {
    it('skips a second call with the same eventId', async () => {
      const data = makeEnvelope('evt-dup-001', { ncId: 'nc-dup', createdBy: 'u-001' });

      consumer.handleNcCreated(data);
      consumer.handleNcCreated(data); // duplicate
      await new Promise((r) => setTimeout(r, 20));

      // log() called exactly once despite two handler invocations
      expect(mockLog).toHaveBeenCalledTimes(1);
    });
  });

  // ── Error swallowing ──────────────────────────────────────────────────────

  describe('error handling', () => {
    it('does not throw when AuditService.log() rejects', async () => {
      mockLog.mockRejectedValueOnce(new Error('DB unavailable'));

      const data = makeEnvelope('evt-err-001', { ncId: 'nc-err', createdBy: 'u-001' });

      // Handler must not throw — RabbitMQ nack would cause infinite retry loop
      expect(() => consumer.handleNcCreated(data)).not.toThrow();
      await new Promise((r) => setTimeout(r, 20)); // let rejection settle
      // No unhandled rejection — test passes if we get here
    });
  });
});
