/**
 * task-completed.consumer.ts
 *
 * RabbitMQ consumer for control.task.completed.v1 events.
 *
 * ARCH-DECISION: Hybrid NestJS app — HTTP + AMQP consumer.
 * See main.ts for the hybrid setup via app.connectMicroservice().
 *
 * ARCH-DECISION: Auto-creates a NonConformity when a control task completes
 * with overallCompliant: false. This keeps nonconformity-service decoupled
 * from control-service — no synchronous HTTP call, no shared DB.
 *
 * ARCH-DECISION: Idempotency is enforced via sourceTaskId + tenantId @@unique
 * in Prisma. If the same event is redelivered (RabbitMQ at-least-once), the
 * Prisma P2002 unique constraint violation is caught and swallowed silently —
 * the NC was already created on the first delivery.
 */

import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NonconformityService } from '../nonconformity.service';

interface TaskCompletedPayload {
  taskId:           string;
  zoneId:           string;
  assigneeId?:      string | null;
  completedAt:      string;
  overallCompliant: boolean;
  ncComment?:       string | null;
}

interface DomainEventEnvelope {
  tenantId:       string;
  payload:        TaskCompletedPayload;
  eventId:        string;
  correlationId?: string;
  timestamp:      string;
}

@Controller()
export class TaskCompletedConsumer {
  private readonly logger = new Logger(TaskCompletedConsumer.name);

  constructor(private readonly ncService: NonconformityService) {}

  @EventPattern('control.task.completed.v1')
  @EventPattern('control.task.completed')
  async handleTaskCompleted(@Payload() data: DomainEventEnvelope): Promise<void> {
    const { tenantId, payload, eventId, correlationId } = data;

    // Only react to non-compliant completions — compliant tasks need no NC
    if (payload.overallCompliant) return;

    this.logger.log(
      `[task.completed] cid=${correlationId ?? '-'} tenant=${tenantId} taskId=${payload.taskId} → auto-creating NC`,
    );

    await this.ncService.createFromTaskEvent({
      tenantId,
      taskId:    payload.taskId,
      zoneId:    payload.zoneId,
      assigneeId: payload.assigneeId ?? null,
      ncComment:  payload.ncComment  ?? null,
      eventId,
    });
  }
}
