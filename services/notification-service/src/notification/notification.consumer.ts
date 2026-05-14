/**
 * notification.consumer.ts
 *
 * RabbitMQ domain event consumer for the notification-service.
 *
 * ARCH-DECISION: Hybrid NestJS app — HTTP+WebSocket + AMQP consumer.
 * See main.ts for the hybrid setup via app.connectMicroservice().
 *
 * ARCH-DECISION: Events are broadcast to tenant-scoped WebSocket rooms
 * (`tenant:<tenantId>`) instead of individual user rooms, decoupling this
 * service from user-service lookups. Assignee-specific events also fan out
 * to the individual user room.
 *
 * ARCH-DECISION: Each handler is deduplicated via IdempotencyGuard because
 * RabbitMQ guarantees at-least-once, not exactly-once delivery. The guard
 * uses a 10 000-entry in-memory LRU — for multi-replica deployments, swap
 * for a Redis NX check on eventId with a 24 h TTL.
 *
 * Both legacy bare patterns (e.g. `control.task.completed`) and versioned
 * patterns (`control.task.completed.v1`) are subscribed so old and new
 * publishers coexist without a coordinated deploy.
 */

import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { IdempotencyGuard } from '@haccp/shared-utils';
import { NotificationGateway } from './notification.gateway';

interface DomainEventEnvelope {
  tenantId:      string;
  payload:       Record<string, unknown>;
  eventId:       string;
  correlationId?: string;
  timestamp:     string;
}

/** Extra fields for assignee-targeted events */
interface AssignedEnvelope extends DomainEventEnvelope {
  payload: DomainEventEnvelope['payload'] & {
    assigneeId?: string | null;
    groupId?:    string | null;
    taskId?:     unknown;
  };
}

@Controller()
export class NotificationConsumer {
  private readonly logger = new Logger(NotificationConsumer.name);
  private readonly dedup  = new IdempotencyGuard(10_000);

  constructor(private readonly gateway: NotificationGateway) {}

  // ─── Generic dispatch ─────────────────────────────────────────────────────
  // Deduplicates, logs, and broadcasts to the tenant room in one call.
  // `logTag` is the short label used in structured log output.

  private dispatch(
    data:       DomainEventEnvelope,
    logTag:     string,
    socketEvent: string,
    logExtra?:  string,
  ): void {
    if (this.dedup.isDuplicate(data.eventId)) return;

    this.logger.log(
      `[${logTag}] cid=${data.correlationId ?? '-'} tenant=${data.tenantId}${logExtra ? ` ${logExtra}` : ''}`,
    );

    this.gateway.emitToTenant(data.tenantId, socketEvent, {
      ...data.payload,
      eventId:   data.eventId,
      timestamp: data.timestamp,
    });
  }

  // ─── nonconformity.nc.created ─────────────────────────────────────────────

  @EventPattern('nonconformity.nc.created')
  @EventPattern('nonconformity.nc.created.v1')
  handleNcCreated(@Payload() data: DomainEventEnvelope): void {
    this.dispatch(
      data,
      'nc.created',
      'notification:nc-created',
      `ncId=${String(data.payload['ncId'] ?? '?')} severity=${String(data.payload['severity'] ?? '?')}`,
    );
  }

  // ─── control.task.completed ───────────────────────────────────────────────

  @EventPattern('control.task.completed')
  @EventPattern('control.task.completed.v1')
  handleTaskCompleted(@Payload() data: DomainEventEnvelope): void {
    this.dispatch(
      data,
      'task.completed',
      'notification:task-completed',
      `taskId=${String(data.payload['taskId'] ?? '?')}`,
    );
  }

  // ─── control.task.assigned ────────────────────────────────────────────────

  @EventPattern('control.task.assigned')
  @EventPattern('control.task.assigned.v1')
  handleTaskAssigned(@Payload() data: AssignedEnvelope): void {
    if (this.dedup.isDuplicate(data.eventId)) return;

    const { assigneeId, groupId, taskId } = data.payload;
    this.logger.log(
      `[task.assigned] cid=${data.correlationId ?? '-'} tenant=${data.tenantId} taskId=${String(taskId ?? '?')} assignee=${String(assigneeId ?? groupId ?? '?')}`,
    );

    // Personal notification to the operator (if individually assigned)
    if (assigneeId) {
      this.gateway.emitToUser(assigneeId, 'notification:task-assigned', {
        ...data.payload,
        eventId:   data.eventId,
        timestamp: data.timestamp,
      });
    }

    // Broadcast to tenant managers
    this.gateway.emitToTenant(data.tenantId, 'notification:task-assigned', {
      ...data.payload,
      eventId:   data.eventId,
      timestamp: data.timestamp,
    });
  }

  // ─── control.tasks.overdue ────────────────────────────────────────────────

  @EventPattern('control.tasks.overdue')
  @EventPattern('control.tasks.overdue.v1')
  handleTasksOverdue(@Payload() data: DomainEventEnvelope): void {
    if (this.dedup.isDuplicate(data.eventId)) return;

    const count       = Number(data.payload['count'] ?? 0);
    const assigneeIds = (data.payload['assigneeIds'] as string[] | undefined) ?? [];

    this.logger.log(`[tasks.overdue] tenant=${data.tenantId} count=${count}`);

    const body = { count, taskIds: data.payload['taskIds'], eventId: data.eventId, timestamp: data.timestamp };

    this.gateway.emitToTenant(data.tenantId, 'notification:tasks-overdue', body);

    for (const assigneeId of assigneeIds) {
      this.gateway.emitToUser(assigneeId, 'notification:tasks-overdue', body);
    }
  }

  // ─── report.report.validated ──────────────────────────────────────────────

  @EventPattern('report.report.validated')
  @EventPattern('report.report.validated.v1')
  handleReportValidated(@Payload() data: DomainEventEnvelope): void {
    this.dispatch(
      data,
      'report.validated',
      'notification:report-validated',
      `reportId=${String(data.payload['reportId'] ?? '?')}`,
    );
  }

  // ─── dlc.labels.expiring-today ────────────────────────────────────────────

  @EventPattern('dlc.labels.expiring-today')
  @EventPattern('dlc.labels.expiring-today.v1')
  handleDlcExpiringToday(@Payload() data: DomainEventEnvelope): void {
    if (this.dedup.isDuplicate(data.eventId)) return;

    const count = Number(data.payload['count'] ?? 0);
    this.logger.log(`[dlc.expiring-today] tenant=${data.tenantId} count=${count}`);

    this.gateway.emitToTenant(data.tenantId, 'notification:dlc-expiring-today', {
      count,
      labels:    data.payload['labels'],
      eventId:   data.eventId,
      timestamp: data.timestamp,
    });
  }
}
