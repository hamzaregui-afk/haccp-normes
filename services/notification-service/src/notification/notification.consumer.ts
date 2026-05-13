/**
 * notification.consumer.ts
 *
 * RabbitMQ domain event consumer for the notification-service.
 *
 * ARCH-DECISION: The notification-service runs as a hybrid NestJS app — it
 * serves HTTP+WebSocket traffic AND consumes RabbitMQ messages simultaneously.
 * The hybrid setup is configured in main.ts via app.connectMicroservice().
 *
 * ARCH-DECISION: Event handling broadcasts to tenant-scoped WebSocket rooms
 * (`tenant:<tenantId>`) rather than individual user rooms. This decouples the
 * notification-service from the user-service (no inter-service call needed to
 * resolve which users to notify). Online users in the tenant receive the event
 * in real-time; offline users miss it (acceptable for MVP — a persistent inbox
 * would require knowing the notification recipients, which requires user-service
 * integration planned for Phase 7).
 *
 * Subscribed event patterns (routing keys on the haccp_notification_queue):
 *  - nonconformity.nc.created   → broadcast NC alert to tenant
 *  - control.task.completed     → broadcast task completion to tenant
 *  - control.task.assigned      → notify assignee + broadcast to tenant managers
 *  - control.tasks.overdue      → broadcast overdue alert to tenant + individual assignees
 *  - report.report.validated    → broadcast report validation to tenant
 *  - dlc.labels.expiring-today  → broadcast DLC expiry alert to tenant (fired daily at 07:00 UTC)
 */

import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NotificationGateway } from './notification.gateway';

interface DomainEventEnvelope {
  tenantId:  string;
  payload:   Record<string, unknown>;
  eventId:   string;
  timestamp: string;
}

@Controller()
export class NotificationConsumer {
  private readonly logger = new Logger(NotificationConsumer.name);

  constructor(private readonly gateway: NotificationGateway) {}

  // ─── nonconformity.nc.created ─────────────────────────────────────────────

  @EventPattern('nonconformity.nc.created')
  handleNcCreated(@Payload() data: DomainEventEnvelope): void {
    this.logger.log(
      `[nc.created] tenant=${data.tenantId} ncId=${String(data.payload['ncId'] ?? '?')} severity=${String(data.payload['severity'] ?? '?')}`,
    );
    this.gateway.emitToTenant(data.tenantId, 'notification:nc-created', {
      ...data.payload,
      eventId:   data.eventId,
      timestamp: data.timestamp,
    });
  }

  // ─── control.task.completed ───────────────────────────────────────────────

  @EventPattern('control.task.completed')
  handleTaskCompleted(@Payload() data: DomainEventEnvelope): void {
    this.logger.log(
      `[task.completed] tenant=${data.tenantId} taskId=${String(data.payload['taskId'] ?? '?')}`,
    );
    this.gateway.emitToTenant(data.tenantId, 'notification:task-completed', {
      ...data.payload,
      eventId:   data.eventId,
      timestamp: data.timestamp,
    });
  }

  // ─── control.task.assigned ────────────────────────────────────────────────

  @EventPattern('control.task.assigned')
  handleTaskAssigned(@Payload() data: DomainEventEnvelope): void {
    const assigneeId = data.payload['assigneeId'] as string | null;
    const groupId    = data.payload['groupId']    as string | null;
    const taskId     = String(data.payload['taskId'] ?? '?');

    this.logger.log(
      `[task.assigned] tenant=${data.tenantId} taskId=${taskId} assignee=${assigneeId ?? groupId ?? '?'}`,
    );

    // Emit to the specific user's room (operator gets a personal notification)
    if (assigneeId) {
      this.gateway.emitToUser(assigneeId, 'notification:task-assigned', {
        ...data.payload,
        eventId:   data.eventId,
        timestamp: data.timestamp,
      });
    }

    // Also broadcast to tenant managers
    this.gateway.emitToTenant(data.tenantId, 'notification:task-assigned', {
      ...data.payload,
      eventId:   data.eventId,
      timestamp: data.timestamp,
    });
  }

  // ─── control.tasks.overdue ────────────────────────────────────────────────

  @EventPattern('control.tasks.overdue')
  handleTasksOverdue(@Payload() data: DomainEventEnvelope): void {
    const count       = Number(data.payload['count'] ?? 0);
    const assigneeIds = (data.payload['assigneeIds'] as string[] | undefined) ?? [];

    this.logger.log(
      `[tasks.overdue] tenant=${data.tenantId} count=${count}`,
    );

    // Broadcast to entire tenant (managers see it)
    this.gateway.emitToTenant(data.tenantId, 'notification:tasks-overdue', {
      count,
      taskIds:   data.payload['taskIds'],
      eventId:   data.eventId,
      timestamp: data.timestamp,
    });

    // Also alert each individual assignee
    for (const assigneeId of assigneeIds) {
      this.gateway.emitToUser(assigneeId, 'notification:tasks-overdue', {
        count,
        taskIds:   data.payload['taskIds'],
        eventId:   data.eventId,
        timestamp: data.timestamp,
      });
    }
  }

  // ─── report.report.validated ──────────────────────────────────────────────

  @EventPattern('report.report.validated')
  handleReportValidated(@Payload() data: DomainEventEnvelope): void {
    this.logger.log(
      `[report.validated] tenant=${data.tenantId} reportId=${String(data.payload['reportId'] ?? '?')}`,
    );
    this.gateway.emitToTenant(data.tenantId, 'notification:report-validated', {
      ...data.payload,
      eventId:   data.eventId,
      timestamp: data.timestamp,
    });
  }

  // ─── dlc.labels.expiring-today ────────────────────────────────────────────

  @EventPattern('dlc.labels.expiring-today')
  handleDlcExpiringToday(@Payload() data: DomainEventEnvelope): void {
    const count = Number(data.payload['count'] ?? 0);
    this.logger.log(
      `[dlc.expiring-today] tenant=${data.tenantId} count=${count}`,
    );
    // Broadcast to all connected users in this tenant's WebSocket room.
    // The web DashboardPage and mobile DLCScreen already listen on this event
    // via their polling queries, but the real-time push triggers immediate refresh.
    this.gateway.emitToTenant(data.tenantId, 'notification:dlc-expiring-today', {
      count,
      labels:    data.payload['labels'],
      eventId:   data.eventId,
      timestamp: data.timestamp,
    });
  }
}
