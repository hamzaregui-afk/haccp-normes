/**
 * task-generator.service.ts
 *
 * Generates ControlTask instances from active ControlSchedule records.
 *
 * ARCH-DECISION: Runs every 15 minutes via setInterval (matches OverdueScheduler
 * pattern — avoids @Cron import complexity for a single recurring job).
 *
 * ARCH-DECISION: Uses PostgreSQL advisory locks (pg_try_advisory_lock) to prevent
 * duplicate task generation when multiple replicas run simultaneously. The lock is
 * per schedule (hashtext(schedule.id) → bigint). If another replica holds the lock,
 * this instance skips that schedule without error.
 *
 * ARCH-DECISION: Idempotency is enforced by @@unique([scheduleId, scheduledAt]) on
 * control_tasks. A P2002 from a duplicate insert is caught and silently skipped —
 * the task was already generated on a previous run.
 *
 * ARCH-DECISION: Tasks are generated in an interactive $transaction so the task row
 * and its OutboxEvent are written atomically. A crash after task creation but before
 * the outbox write would leave the task without a notification — the transaction
 * prevents this split.
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ControlSchedule, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RecurrenceEngine } from '../recurrence/recurrence.engine';
import type { RecurrenceConfig } from '../dto/schedule.dto';

@Injectable()
export class TaskGeneratorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskGeneratorService.name);
  private intervalHandle: NodeJS.Timeout | null = null;

  // 15-minute cadence: tasks are generated up to `advanceGenerateDays` ahead,
  // so a 15-min lag between generation runs is negligible.
  private static readonly INTERVAL_MS = 15 * 60 * 1_000;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // Run once at startup, then every 15 minutes
    void this.generatePendingTasks();
    this.intervalHandle = setInterval(
      () => void this.generatePendingTasks(),
      TaskGeneratorService.INTERVAL_MS,
    );
    this.logger.log('TaskGeneratorService started — interval: 15 min');
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  // ── Core generation loop ────────────────────────────────────────────────────

  async generatePendingTasks(): Promise<void> {
    const now      = new Date();
    // Default lookahead: 7 days. Each schedule can override via recurrenceJson.advanceGenerateDays.
    const maxAhead = new Date(now.getTime() + 7 * 86_400_000);

    const schedules = await this.prisma.controlSchedule.findMany({
      where: {
        isActive:  true,
        startDate: { lte: maxAhead },
        OR: [
          { nextRunAt: null },
          { nextRunAt: { lte: now } },
        ],
      },
    });

    this.logger.debug(`[TaskGenerator] ${schedules.length} schedule(s) to process`);

    for (const schedule of schedules) {
      try {
        await this.processSchedule(schedule, now, maxAhead);
      } catch (err) {
        this.logger.error(
          `[TaskGenerator] schedule ${schedule.id} failed`,
          err instanceof Error ? err.stack : err,
        );
      }
    }
  }

  // ── Per-schedule processing ─────────────────────────────────────────────────

  private async processSchedule(
    schedule:  ControlSchedule,
    now:       Date,
    maxAhead:  Date,
  ): Promise<void> {
    // Acquire per-schedule advisory lock to prevent concurrent generation
    const lockKey = this.scheduleHashKey(schedule.id);

    const [lockResult] = await this.prisma.$queryRaw<[{ acquired: boolean }]>`
      SELECT pg_try_advisory_lock(${lockKey}::bigint) AS acquired
    `;

    if (!lockResult.acquired) {
      this.logger.debug(`[TaskGenerator] schedule ${schedule.id} locked — skipping`);
      return;
    }

    try {
      const config  = schedule.recurrenceJson as unknown as RecurrenceConfig;
      const advance = config.advanceGenerateDays ?? 7;
      const windowEnd = new Date(Math.min(
        maxAhead.getTime(),
        now.getTime() + advance * 86_400_000,
      ));

      // Window starts from last generation point (or schedule start if first run)
      const windowStart = schedule.lastGeneratedAt ?? schedule.startDate;

      const occurrences = RecurrenceEngine.getOccurrencesInWindow(
        schedule.frequency,
        config,
        windowStart,
        windowEnd,
        schedule.startDate,
        schedule.endDate ?? null,
      );

      let created = 0;
      for (const scheduledAt of occurrences) {
        const didCreate = await this.createTaskForSlot(schedule, config, scheduledAt);
        if (didCreate) created++;
      }

      // Compute next occurrence so the scheduler knows when to run again
      const nextRunAt = RecurrenceEngine.getNextOccurrence(
        schedule.frequency,
        config,
        now,
        schedule.startDate,
        schedule.endDate ?? null,
      );

      // If endDate is in the past and no future occurrence exists → deactivate
      const isStillActive = nextRunAt !== null;

      await this.prisma.controlSchedule.update({
        where: { id: schedule.id },
        data: {
          lastGeneratedAt: now,
          nextRunAt,
          isActive: isStillActive,
        },
      });

      if (created > 0) {
        this.logger.log(
          `[TaskGenerator] schedule ${schedule.id}: +${created} task(s) generated`,
        );
      }
    } finally {
      await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${lockKey}::bigint)`;
    }
  }

  // ── Task creation ────────────────────────────────────────────────────────────

  /**
   * Creates a ControlTask + OutboxEvent for one occurrence slot.
   * Returns true if created, false if the slot already existed (idempotent).
   */
  private async createTaskForSlot(
    schedule:    ControlSchedule,
    config:      RecurrenceConfig,
    scheduledAt: Date,
  ): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Snapshot the template checklist at generation time for HACCP immutability.
        // Also select name so it can be included in the outbox event payload,
        // letting the notification-service show a human-readable template name
        // instead of falling back to the raw taskId.
        const template = await tx.controlTemplate.findFirst({
          where: { id: schedule.templateId },
          select: { checklistJson: true, name: true },
        });

        const task = await tx.controlTask.create({
          data: {
            templateId:        schedule.templateId,
            zoneId:            schedule.zoneId,
            assigneeId:        schedule.assigneeId ?? null,
            groupId:           schedule.groupId    ?? null,
            tenantId:          schedule.tenantId,
            scheduleId:        schedule.id,
            status:            'PLANNED',
            scheduledAt,
            checklistSnapshot: template?.checklistJson ?? Prisma.JsonNull,
          },
        });

        // Outbox: assignment notification via notification-service
        await tx.outboxEvent.create({
          data: {
            eventType: 'control.task.assigned.v1',
            tenantId:  schedule.tenantId,
            payload: {
              taskId:       task.id,
              scheduleId:   schedule.id,
              templateId:   schedule.templateId,
              templateName: template?.name ?? null,
              zoneId:       schedule.zoneId,
              assigneeId:   schedule.assigneeId ?? null,
              groupId:      schedule.groupId    ?? null,
              scheduledAt:  scheduledAt.toISOString(),
              frequency:    schedule.frequency,
            },
          },
        });
      });

      return true;
    } catch (err: unknown) {
      // P2002 = unique constraint (scheduleId, scheduledAt) — already generated
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        this.logger.debug(
          `[TaskGenerator] slot ${scheduledAt.toISOString()} already exists for schedule ${schedule.id}`,
        );
        return false;
      }
      throw err;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Converts a CUID schedule ID to a stable bigint for pg_try_advisory_lock.
   * Uses a simple DJB2-style hash — collision probability for <10k schedules is negligible.
   */
  private scheduleHashKey(id: string): bigint {
    let hash = 5381n;
    for (const ch of id) {
      hash = ((hash << 5n) + hash + BigInt(ch.charCodeAt(0))) & 0x7FFF_FFFF_FFFF_FFFFn;
    }
    return hash;
  }
}
