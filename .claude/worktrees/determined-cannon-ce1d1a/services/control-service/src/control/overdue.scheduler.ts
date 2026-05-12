import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * OverdueScheduler — marks PLANNED tasks as OVERDUE once their scheduledAt
 * has passed without being started.
 *
 * ARCH-DECISION: Uses setInterval instead of @nestjs/schedule to avoid adding
 * a dependency for a single recurring task. Runs every 5 minutes.
 * IN_PROGRESS tasks are NOT marked overdue — an operator who started late is
 * still better than one who never started.
 */
@Injectable()
export class OverdueScheduler implements OnModuleInit {
  private readonly logger = new Logger(OverdueScheduler.name);

  // ARCH-DECISION: 5-minute interval balances freshness vs. DB load.
  // A task scheduled for 09:00 will appear overdue by 09:05 at worst.
  // The compliance rate KPI on the dashboard re-queries on each render, so
  // there is at most a 5-minute lag before the dashboard reflects the update.
  private static readonly INTERVAL_MS = 5 * 60 * 1_000;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Run once at startup (catches tasks that became overdue while the service
    // was down), then on the regular interval.
    void this.markOverdueTasks();
    setInterval(() => void this.markOverdueTasks(), OverdueScheduler.INTERVAL_MS);
  }

  private async markOverdueTasks(): Promise<void> {
    try {
      const now = new Date();

      const { count } = await this.prisma.controlTask.updateMany({
        where: {
          status:      'PLANNED',
          scheduledAt: { lt: now },
        },
        data: {
          status: 'OVERDUE',
        },
      });

      if (count > 0) {
        this.logger.warn(`Marked ${count} task(s) as OVERDUE (scheduled before ${now.toISOString()})`);
      }
    } catch (err) {
      // Never crash the process — log and move on.
      this.logger.error('Failed to mark overdue tasks', err instanceof Error ? err.stack : err);
    }
  }
}
