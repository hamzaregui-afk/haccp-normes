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
 * ARCH-DECISION: Stacked @EventPattern decorators CANNOT be used on a single
 * method — NestJS SetMetadata overwrites the metadata key, leaving only the
 * last-applied (outermost) pattern registered. Each event version therefore
 * has its own handler method that delegates to a shared implementation.
 * This ensures both bare patterns (legacy publishers) and .v1 patterns
 * (outbox worker) are consumed and acknowledged correctly.
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

interface OverdueEnvelope extends DomainEventEnvelope {
  payload: DomainEventEnvelope['payload'] & {
    count?:       number;
    taskIds?:     unknown;
    assigneeIds?: string[];
  };
}

@Controller()
export class NotificationConsumer {
  private readonly logger = new Logger(NotificationConsumer.name);
  private readonly dedup  = new IdempotencyGuard(10_000);

  constructor(private readonly gateway: NotificationGateway) {}

  // ─── Generic dispatch helper ──────────────────────────────────────────────
  private dispatch(
    data:        DomainEventEnvelope,
    logTag:      string,
    socketEvent: string,
    logExtra?:   string,
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
  handleNcCreated(@Payload() data: DomainEventEnvelope): void {
    this.dispatchNcCreated(data);
  }

  @EventPattern('nonconformity.nc.created.v1')
  handleNcCreatedV1(@Payload() data: DomainEventEnvelope): void {
    this.dispatchNcCreated(data);
  }

  private dispatchNcCreated(data: DomainEventEnvelope): void {
    this.dispatch(
      data,
      'nc.created',
      'notification:nc-created',
      `ncId=${String(data.payload['ncId'] ?? '?')} severity=${String(data.payload['severity'] ?? '?')}`,
    );
  }

  // ─── control.task.completed ───────────────────────────────────────────────

  @EventPattern('control.task.completed')
  handleTaskCompleted(@Payload() data: DomainEventEnvelope): void {
    this.dispatchTaskCompleted(data);
  }

  @EventPattern('control.task.completed.v1')
  handleTaskCompletedV1(@Payload() data: DomainEventEnvelope): void {
    this.dispatchTaskCompleted(data);
  }

  private dispatchTaskCompleted(data: DomainEventEnvelope): void {
    this.dispatch(
      data,
      'task.completed',
      'notification:task-completed',
      `taskId=${String(data.payload['taskId'] ?? '?')}`,
    );
  }

  // ─── control.task.assigned ────────────────────────────────────────────────

  @EventPattern('control.task.assigned')
  handleTaskAssigned(@Payload() data: AssignedEnvelope): void {
    this.dispatchTaskAssigned(data);
  }

  @EventPattern('control.task.assigned.v1')
  handleTaskAssignedV1(@Payload() data: AssignedEnvelope): void {
    this.dispatchTaskAssigned(data);
  }

  private dispatchTaskAssigned(data: AssignedEnvelope): void {
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
  handleTasksOverdue(@Payload() data: OverdueEnvelope): void {
    this.dispatchTasksOverdue(data);
  }

  @EventPattern('control.tasks.overdue.v1')
  handleTasksOverdueV1(@Payload() data: OverdueEnvelope): void {
    this.dispatchTasksOverdue(data);
  }

  private dispatchTasksOverdue(data: OverdueEnvelope): void {
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
  handleReportValidated(@Payload() data: DomainEventEnvelope): void {
    this.dispatchReportValidated(data);
  }

  @EventPattern('report.report.validated.v1')
  handleReportValidatedV1(@Payload() data: DomainEventEnvelope): void {
    this.dispatchReportValidated(data);
  }

  private dispatchReportValidated(data: DomainEventEnvelope): void {
    this.dispatch(
      data,
      'report.validated',
      'notification:report-validated',
      `reportId=${String(data.payload['reportId'] ?? '?')}`,
    );
  }

  // ─── dlc.labels.expiring-today ────────────────────────────────────────────

  @EventPattern('dlc.labels.expiring-today')
  handleDlcExpiringToday(@Payload() data: DomainEventEnvelope): void {
    this.dispatchDlcExpiringToday(data);
  }

  @EventPattern('dlc.labels.expiring-today.v1')
  handleDlcExpiringTodayV1(@Payload() data: DomainEventEnvelope): void {
    this.dispatchDlcExpiringToday(data);
  }

  private dispatchDlcExpiringToday(data: DomainEventEnvelope): void {
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
