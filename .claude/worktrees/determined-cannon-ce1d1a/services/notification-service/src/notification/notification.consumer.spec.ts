/**
 * notification.consumer.spec.ts
 *
 * Unit tests for NotificationConsumer — verifies that domain events received
 * from RabbitMQ are forwarded to the correct WebSocket tenant rooms.
 *
 * Strategy:
 *  - Mock NotificationGateway.emitToTenant (no real WebSocket needed)
 *  - Instantiate NotificationConsumer directly (no NestJS DI overhead)
 *  - Assert event payload forwarding for all three subscribed patterns
 */

import { NotificationConsumer } from './notification.consumer';

// ─── Gateway mock ─────────────────────────────────────────────────────────────

function makeGatewayMock() {
  return {
    emitToUser:   jest.fn(),
    emitToTenant: jest.fn(),
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_ENVELOPE = {
  eventId:   'evt-001',
  timestamp: '2026-05-07T10:00:00.000Z',
};

const NC_CREATED_DATA = {
  ...BASE_ENVELOPE,
  tenantId: 'tenant-abc',
  payload: {
    ncId:        'nc-001',
    severity:    'HIGH',
    category:    'TEMPERATURE',
    description: 'Freezer temp exceeded 4°C',
    createdBy:   'operator-001',
  },
};

const TASK_COMPLETED_DATA = {
  ...BASE_ENVELOPE,
  tenantId: 'tenant-abc',
  payload: {
    taskId:      'task-001',
    completedBy: 'operator-001',
    status:      'COMPLETED',
  },
};

const REPORT_VALIDATED_DATA = {
  ...BASE_ENVELOPE,
  tenantId: 'tenant-abc',
  payload: {
    reportId:    'report-001',
    validatedBy: 'manager-001',
    status:      'VALIDATED',
  },
};

const DLC_EXPIRING_DATA = {
  ...BASE_ENVELOPE,
  tenantId: 'tenant-abc',
  payload: {
    count:  2,
    labels: [
      { id: 'lbl-001', productName: 'Poulet rôti',  lotNumber: 'LOT-001', expiresAt: '2026-05-11T00:00:00.000Z' },
      { id: 'lbl-002', productName: 'Salade niçoise', lotNumber: null,     expiresAt: '2026-05-11T00:00:00.000Z' },
    ],
  },
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('NotificationConsumer', () => {
  let consumer: NotificationConsumer;
  let gateway: ReturnType<typeof makeGatewayMock>;

  beforeEach(() => {
    gateway  = makeGatewayMock();
    consumer = new NotificationConsumer(gateway as never);
  });

  // ── nonconformity.nc.created ───────────────────────────────────────────────

  describe('handleNcCreated', () => {
    it('calls emitToTenant with the correct tenant and event name', () => {
      consumer.handleNcCreated(NC_CREATED_DATA);

      expect(gateway.emitToTenant).toHaveBeenCalledWith(
        'tenant-abc',
        'notification:nc-created',
        expect.any(Object),
      );
    });

    it('forwards the NC payload fields', () => {
      consumer.handleNcCreated(NC_CREATED_DATA);

      expect(gateway.emitToTenant).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          ncId:     'nc-001',
          severity: 'HIGH',
          category: 'TEMPERATURE',
        }),
      );
    });

    it('includes eventId and timestamp in the broadcast payload', () => {
      consumer.handleNcCreated(NC_CREATED_DATA);

      expect(gateway.emitToTenant).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          eventId:   'evt-001',
          timestamp: '2026-05-07T10:00:00.000Z',
        }),
      );
    });

    it('does NOT call emitToUser (tenant broadcast only)', () => {
      consumer.handleNcCreated(NC_CREATED_DATA);
      expect(gateway.emitToUser).not.toHaveBeenCalled();
    });
  });

  // ── control.task.completed ─────────────────────────────────────────────────

  describe('handleTaskCompleted', () => {
    it('calls emitToTenant with the correct tenant and event name', () => {
      consumer.handleTaskCompleted(TASK_COMPLETED_DATA);

      expect(gateway.emitToTenant).toHaveBeenCalledWith(
        'tenant-abc',
        'notification:task-completed',
        expect.any(Object),
      );
    });

    it('forwards the task payload fields', () => {
      consumer.handleTaskCompleted(TASK_COMPLETED_DATA);

      expect(gateway.emitToTenant).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          taskId:      'task-001',
          completedBy: 'operator-001',
          status:      'COMPLETED',
        }),
      );
    });

    it('does NOT call emitToUser', () => {
      consumer.handleTaskCompleted(TASK_COMPLETED_DATA);
      expect(gateway.emitToUser).not.toHaveBeenCalled();
    });
  });

  // ── report.report.validated ────────────────────────────────────────────────

  describe('handleReportValidated', () => {
    it('calls emitToTenant with the correct tenant and event name', () => {
      consumer.handleReportValidated(REPORT_VALIDATED_DATA);

      expect(gateway.emitToTenant).toHaveBeenCalledWith(
        'tenant-abc',
        'notification:report-validated',
        expect.any(Object),
      );
    });

    it('forwards the report payload fields', () => {
      consumer.handleReportValidated(REPORT_VALIDATED_DATA);

      expect(gateway.emitToTenant).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          reportId:    'report-001',
          validatedBy: 'manager-001',
          status:      'VALIDATED',
        }),
      );
    });

    it('does NOT call emitToUser', () => {
      consumer.handleReportValidated(REPORT_VALIDATED_DATA);
      expect(gateway.emitToUser).not.toHaveBeenCalled();
    });
  });

  // ── dlc.labels.expiring-today ─────────────────────────────────────────────

  describe('handleDlcExpiringToday', () => {
    it('calls emitToTenant with notification:dlc-expiring-today', () => {
      consumer.handleDlcExpiringToday(DLC_EXPIRING_DATA);

      expect(gateway.emitToTenant).toHaveBeenCalledWith(
        'tenant-abc',
        'notification:dlc-expiring-today',
        expect.any(Object),
      );
    });

    it('forwards count and labels in payload', () => {
      consumer.handleDlcExpiringToday(DLC_EXPIRING_DATA);

      expect(gateway.emitToTenant).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ count: 2, labels: expect.any(Array) }),
      );
    });

    it('does NOT call emitToUser', () => {
      consumer.handleDlcExpiringToday(DLC_EXPIRING_DATA);
      expect(gateway.emitToUser).not.toHaveBeenCalled();
    });
  });

  // ── isolation ──────────────────────────────────────────────────────────────

  describe('isolation', () => {
    it('each handler calls emitToTenant exactly once', () => {
      consumer.handleNcCreated(NC_CREATED_DATA);
      expect(gateway.emitToTenant).toHaveBeenCalledTimes(1);
      gateway.emitToTenant.mockClear();

      consumer.handleTaskCompleted(TASK_COMPLETED_DATA);
      expect(gateway.emitToTenant).toHaveBeenCalledTimes(1);
      gateway.emitToTenant.mockClear();

      consumer.handleReportValidated(REPORT_VALIDATED_DATA);
      expect(gateway.emitToTenant).toHaveBeenCalledTimes(1);
      gateway.emitToTenant.mockClear();

      consumer.handleDlcExpiringToday(DLC_EXPIRING_DATA);
      expect(gateway.emitToTenant).toHaveBeenCalledTimes(1);
    });
  });
});
