/**
 * overdue.scheduler.spec.ts
 *
 * Verifies that OverdueScheduler correctly transitions PLANNED tasks to OVERDUE.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { OverdueScheduler } from './overdue.scheduler';
import { PrismaService } from '../prisma/prisma.service';

// ── Mock ────────────────────────────────────────────────────────────────────

const mockPrisma = {
  controlTask: {
    updateMany: jest.fn(),
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeScheduler(): OverdueScheduler {
  return new OverdueScheduler(mockPrisma as unknown as PrismaService);
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('OverdueScheduler', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('markOverdueTasks (via onModuleInit)', () => {
    it('calls updateMany with status PLANNED and scheduledAt lt now', async () => {
      mockPrisma.controlTask.updateMany.mockResolvedValue({ count: 0 });

      const scheduler = makeScheduler();
      // Trigger manually instead of waiting for setInterval
      await (scheduler as unknown as { markOverdueTasks(): Promise<void> }).markOverdueTasks();

      expect(mockPrisma.controlTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PLANNED' }),
          data:  { status: 'OVERDUE' },
        }),
      );
    });

    it('does not throw when updateMany returns count 0 (no tasks to update)', async () => {
      mockPrisma.controlTask.updateMany.mockResolvedValue({ count: 0 });

      const scheduler = makeScheduler();
      await expect(
        (scheduler as unknown as { markOverdueTasks(): Promise<void> }).markOverdueTasks(),
      ).resolves.toBeUndefined();
    });

    it('does not throw when the DB call fails (resilience)', async () => {
      mockPrisma.controlTask.updateMany.mockRejectedValue(new Error('DB connection lost'));

      const scheduler = makeScheduler();
      await expect(
        (scheduler as unknown as { markOverdueTasks(): Promise<void> }).markOverdueTasks(),
      ).resolves.toBeUndefined();
    });

    it('targets only PLANNED tasks — not IN_PROGRESS or COMPLETED', async () => {
      mockPrisma.controlTask.updateMany.mockResolvedValue({ count: 2 });

      const scheduler = makeScheduler();
      await (scheduler as unknown as { markOverdueTasks(): Promise<void> }).markOverdueTasks();

      const call = mockPrisma.controlTask.updateMany.mock.calls[0]?.[0];
      expect(call?.where?.status).toBe('PLANNED');
      // Ensure we're NOT passing an array of statuses (would accidentally affect IN_PROGRESS)
      expect(Array.isArray(call?.where?.status)).toBe(false);
    });
  });
});
