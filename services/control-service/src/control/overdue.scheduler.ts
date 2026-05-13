import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { publishDomainEvent } from '@haccp/shared-utils';

/**
 * OverdueScheduler — marks PLANNED tasks as OVERDUE once their scheduledAt
 * has passed without being started, then notifies affected tenants.
 *
 * ARCH-DECISION: Uses setInterval instead of @nestjs/schedule to avoid adding
 * a dependency for a single recurring task. Runs every 5 minutes.
 * IN_PROGRESS tasks are NOT marked overdue — an operator who started late is
 * still better than one who never started.
 *
 * ARCH-DECISION: After the bulk updateMany, we query the just-transitioned tasks
 * (using lastRunAt as lower bound) to group by tenant and publish per-tenant
 * domain events. This lets notification-service alert managers and assignees
 * without knowing tenant structure in advance.
 */
@Injectable()
export class OverdueScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OverdueScheduler.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private lastRunAt: Date = new Date();

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
    this.intervalHandle = setInterval(
      () => void this.markOverdueTasks(),
      OverdueScheduler.INTERVAL_MS,
    );
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private async markOverdueTasks(): Promise<void> {
    const now   = new Date();
    const since = this.lastRunAt;

    try {
      // 1. Bulk-update: PLANNED → OVERDUE for all tasks past their scheduled time
      const { count } = await this.prisma.controlTask.updateMany({
        where: {
          status:      'PLANNED',
          scheduledAt: { lt: now },
        },
        data: { status: 'OVERDUE' },
      });

      if (count > 0) {
        this.logger.warn(
          `Marked ${count} task(s) as OVERDUE (scheduled before ${now.toISOString()})`,
        );

        // 2. Find tasks that just transitioned (between last run and now)
        //    to build per-tenant notification payloads.
        const justTransitioned = await this.prisma.controlTask.findMany({
          where: {
            status:      'OVERDUE',
            scheduledAt: { gte: since, lt: now },
          },
          select: {
            id:         true,
            tenantId:   true,
            assigneeId: true,
            groupId:    true,
          },
        });

        // 3. Group by tenantId
        const byTenant = new Map<string, {
          taskIds:     string[];
          assigneeIds: string[];
          groupIds:    string[];
        }>();

        for (const task of justTransitioned) {
          if (!byTenant.has(task.tenantId)) {
            byTenant.set(task.tenantId, { taskIds: [], assigneeIds: [], groupIds: [] });
          }
          const entry = byTenant.get(task.tenantId)!;
          entry.taskIds.push(task.id);
          if (task.assigneeId) entry.assigneeIds.push(task.assigneeId);
          if (task.groupId)    entry.groupIds.push(task.groupId);
        }

        // 4. Publish one domain event per tenant
        for (const [tenantId, data] of byTenant) {
          void publishDomainEvent({
            eventType: 'control.tasks.overdue',
            tenantId,
            payload: {
              count:       data.taskIds.length,
              taskIds:     data.taskIds,
              assigneeIds: [...new Set(data.assigneeIds)],
              groupIds:    [...new Set(data.groupIds)],
            },
          });
        }
      }
    } catch (err) {
      this.logger.error(
        'Failed to mark overdue tasks',
        err instanceof Error ? err.stack : err,
      );
    } finally {
      this.lastRunAt = now;
    }
  }
}
