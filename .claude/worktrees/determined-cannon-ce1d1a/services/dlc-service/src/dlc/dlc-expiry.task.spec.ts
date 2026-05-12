/**
 * dlc-expiry.task.spec.ts
 *
 * Unit tests for DlcExpiryTask — verifies:
 *  - checkAndNotify() calls publishDomainEvent once per tenant
 *  - Labels are correctly grouped by tenant before publishing
 *  - Empty result set → no events published
 *  - DB errors are caught and logged (never thrown)
 */

jest.mock('@haccp/shared-utils', () => ({
  publishDomainEvent: jest.fn().mockResolvedValue(undefined),
}));

import { Logger } from '@nestjs/common';
import { publishDomainEvent } from '@haccp/shared-utils';
import { DlcExpiryTask } from './dlc-expiry.task';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrismaMock(labels: Array<{
  id: string; tenantId: string; productName: string;
  lotNumber: string | null; expiresAt: Date;
}>) {
  return {
    dlcLabel: {
      findMany: jest.fn().mockResolvedValue(labels),
    },
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const EXPIRY_DATE = new Date('2026-05-11T00:00:00.000Z');

const LABELS_TWO_TENANTS = [
  { id: 'l1', tenantId: 'tenant-A', productName: 'Poulet', lotNumber: 'LOT-A1', expiresAt: EXPIRY_DATE },
  { id: 'l2', tenantId: 'tenant-A', productName: 'Salade', lotNumber: null,     expiresAt: EXPIRY_DATE },
  { id: 'l3', tenantId: 'tenant-B', productName: 'Fromage', lotNumber: 'LOT-B1', expiresAt: EXPIRY_DATE },
];

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('DlcExpiryTask', () => {
  let task: DlcExpiryTask;
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock = makePrismaMock([]);
    task       = new DlcExpiryTask(prismaMock as never);
    // Suppress Logger output in tests
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => logSpy.mockRestore());

  // ── No labels ───────────────────────────────────────────────────────────────

  it('publishes no events when no labels are expiring', async () => {
    prismaMock.dlcLabel.findMany.mockResolvedValue([]);

    await task.checkAndNotify();

    expect(publishDomainEvent).not.toHaveBeenCalled();
  });

  // ── Multi-tenant grouping ───────────────────────────────────────────────────

  it('publishes one event per tenant', async () => {
    prismaMock.dlcLabel.findMany.mockResolvedValue(LABELS_TWO_TENANTS);

    await task.checkAndNotify();

    // 2 tenants → 2 events
    expect(publishDomainEvent).toHaveBeenCalledTimes(2);
  });

  it('publishes the correct event type', async () => {
    prismaMock.dlcLabel.findMany.mockResolvedValue(LABELS_TWO_TENANTS);

    await task.checkAndNotify();

    for (const call of (publishDomainEvent as jest.Mock).mock.calls) {
      expect(call[0]).toMatchObject({ eventType: 'dlc.labels.expiring-today' });
    }
  });

  it('includes correct count and labels for each tenant', async () => {
    prismaMock.dlcLabel.findMany.mockResolvedValue(LABELS_TWO_TENANTS);

    await task.checkAndNotify();

    const calls = (publishDomainEvent as jest.Mock).mock.calls.map(
      (c: [{ tenantId: string; payload: { count: number; labels: unknown[] } }]) => c[0],
    );

    const tenantA = calls.find((c) => c.tenantId === 'tenant-A');
    expect(tenantA?.payload.count).toBe(2);
    expect(tenantA?.payload.labels).toHaveLength(2);

    const tenantB = calls.find((c) => c.tenantId === 'tenant-B');
    expect(tenantB?.payload.count).toBe(1);
  });

  // ── Error resilience ────────────────────────────────────────────────────────

  it('does not throw when the DB call fails', async () => {
    prismaMock.dlcLabel.findMany.mockRejectedValue(new Error('DB connection lost'));

    await expect(task.checkAndNotify()).resolves.not.toThrow();
  });

  it('does not throw when publishDomainEvent fails for one tenant', async () => {
    prismaMock.dlcLabel.findMany.mockResolvedValue(LABELS_TWO_TENANTS);
    (publishDomainEvent as jest.Mock).mockRejectedValueOnce(new Error('AMQP down'));

    await expect(task.checkAndNotify()).resolves.not.toThrow();
  });
});
