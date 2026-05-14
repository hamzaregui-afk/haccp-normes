/**
 * outbox.worker.ts — Transactional Outbox relay for control-service
 *
 * Extends BaseOutboxWorker which provides the re-entrancy guard, poll loop,
 * and processSingle error-handling. This class supplies only the Prisma-backed
 * implementations of fetchPending / markPublished / markFailed / publish.
 *
 * Runs every 5 seconds via @Cron. ARCH-DECISION: parallel dispatch
 * (Promise.allSettled) is used by the base class — acceptable since HACCP
 * domain events are low-frequency (< 10/min) and concurrent Prisma updates on
 * separate rows are safe.
 *
 * Ops monitor: alert on `SELECT COUNT(*) FROM outbox_events WHERE status = 'FAILED'` > 0.
 */
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxEventStatus } from '@prisma/client';
import { BaseOutboxWorker, publishDomainEvent } from '@haccp/shared-utils';
import type { OutboxEventRow } from '@haccp/shared-utils';
import { PrismaService } from '../prisma/prisma.service';

const MAX_RETRIES = 3;
const BATCH_SIZE  = 50; // max rows per poll — keeps each cycle bounded under load

@Injectable()
export class OutboxWorker extends BaseOutboxWorker {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async tick(): Promise<void> {
    await this.processAll();
  }

  protected fetchPending(): Promise<OutboxEventRow[]> {
    return this.prisma.outboxEvent.findMany({
      where:   { status: OutboxEventStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take:    BATCH_SIZE,
    }) as Promise<OutboxEventRow[]>;
  }

  protected async markPublished(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data:  { status: OutboxEventStatus.PUBLISHED, processedAt: new Date() },
    });
  }

  protected async markFailed(id: string, retries: number): Promise<void> {
    const newRetries = retries + 1;
    await this.prisma.outboxEvent.update({
      where: { id },
      data:  {
        retries: newRetries,
        status:  newRetries >= MAX_RETRIES
          ? OutboxEventStatus.FAILED
          : OutboxEventStatus.PENDING,
      },
    });
  }

  protected async publish(event: OutboxEventRow): Promise<void> {
    await publishDomainEvent({
      eventType:     event.eventType,
      tenantId:      event.tenantId,
      payload:       event.payload as Record<string, unknown>,
      correlationId: event.correlationId ?? undefined,
    });
  }
}
