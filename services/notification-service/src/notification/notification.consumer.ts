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
 *
 * ARCH-DECISION: noAck: false requires explicit channel.ack() in each handler.
 * NestJS 10.x RmqServer only auto-acks @MessagePattern (request-reply) handlers,
 * NOT @EventPattern (fire-and-forget) handlers. Without an explicit ack,
 * messages stay UNACKNOWLEDGED and RabbitMQ's consumer_timeout (30 min) kills
 * the channel, redelivering messages forever. We call ctx.getChannelRef().ack()
 * at the END of every handler — after processing — to guarantee at-least-once
 * semantics: if the service crashes mid-handler, the message is re-delivered
 * on the next startup.
 */

import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { IdempotencyGuard } from '@haccp/shared-utils';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';

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

  constructor(
    private readonly gateway:  NotificationGateway,
    private readonly service:  NotificationService,
  ) {}

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
  handleNcCreated(@Payload() data: DomainEventEnvelope, @Ctx() ctx: RmqContext): void {
    this.dispatchNcCreated(data);
    ctx.getChannelRef().ack(ctx.getMessage());
  }

  @EventPattern('nonconformity.nc.created.v1')
  handleNcCreatedV1(@Payload() data: DomainEventEnvelope, @Ctx() ctx: RmqContext): void {
    this.dispatchNcCreated(data);
    ctx.getChannelRef().ack(ctx.getMessage());
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
  handleTaskCompleted(@Payload() data: DomainEventEnvelope, @Ctx() ctx: RmqContext): void {
    this.dispatchTaskCompleted(data);
    ctx.getChannelRef().ack(ctx.getMessage());
  }

  @EventPattern('control.task.completed.v1')
  handleTaskCompletedV1(@Payload() data: DomainEventEnvelope, @Ctx() ctx: RmqContext): void {
    this.dispatchTaskCompleted(data);
    ctx.getChannelRef().ack(ctx.getMessage());
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
  handleTaskAssigned(@Payload() data: AssignedEnvelope, @Ctx() ctx: RmqContext): void {
    this.dispatchTaskAssigned(data);
    ctx.getChannelRef().ack(ctx.getMessage());
  }

  @EventPattern('control.task.assigned.v1')
  handleTaskAssignedV1(@Payload() data: AssignedEnvelope, @Ctx() ctx: RmqContext): void {
    this.dispatchTaskAssigned(data);
    ctx.getChannelRef().ack(ctx.getMessage());
  }

  private dispatchTaskAssigned(data: AssignedEnvelope): void {
    if (this.dedup.isDuplicate(data.eventId)) return;

    const { assigneeId, groupId, taskId, templateName, scheduledAt } = data.payload as {
      assigneeId?:   string | null;
      groupId?:      string | null;
      taskId?:       string | null;
      templateName?: string;
      scheduledAt?:  string;
    };

    this.logger.log(
      `[task.assigned] cid=${data.correlationId ?? '-'} tenant=${data.tenantId} taskId=${taskId ?? '?'} assignee=${assigneeId ?? groupId ?? '?'}`,
    );

    const socketPayload = { ...data.payload, eventId: data.eventId, timestamp: data.timestamp };

    // Personal notification to the operator (if individually assigned)
    if (assigneeId) {
      this.gateway.emitToUser(assigneeId, 'notification:task-assigned', socketPayload);

      // ARCH-DECISION: Persist to DB so operators can retrieve notifications
      // after reconnecting (GET /notifications endpoint). WebSocket alone loses
      // events for users who were offline when the message was dispatched.
      void this.service.create({
        userId: assigneeId,
        type:   'TASK_ASSIGNED',
        title:  `Nouvelle tâche : ${templateName ?? 'Contrôle HACCP'}`,
        body:   `Planifiée le ${scheduledAt
          ? new Date(scheduledAt).toLocaleDateString('fr-FR')
          : '—'}${taskId ? ` • Tâche ${taskId.slice(-6)}` : ''}`,
      }, data.tenantId).catch((err: unknown) =>
        this.logger.warn(`[task.assigned] DB persist failed: ${String(err)}`),
      );
    }

    // Broadcast to tenant managers
    this.gateway.emitToTenant(data.tenantId, 'notification:task-assigned', socketPayload);
  }

  // ─── control.tasks.overdue ────────────────────────────────────────────────

  @EventPattern('control.tasks.overdue')
  handleTasksOverdue(@Payload() data: OverdueEnvelope, @Ctx() ctx: RmqContext): void {
    this.dispatchTasksOverdue(data);
    ctx.getChannelRef().ack(ctx.getMessage());
  }

  @EventPattern('control.tasks.overdue.v1')
  handleTasksOverdueV1(@Payload() data: OverdueEnvelope, @Ctx() ctx: RmqContext): void {
    this.dispatchTasksOverdue(data);
    ctx.getChannelRef().ack(ctx.getMessage());
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
  handleReportValidated(@Payload() data: DomainEventEnvelope, @Ctx() ctx: RmqContext): void {
    this.dispatchReportValidated(data);
    ctx.getChannelRef().ack(ctx.getMessage());
  }

  @EventPattern('report.report.validated.v1')
  handleReportValidatedV1(@Payload() data: DomainEventEnvelope, @Ctx() ctx: RmqContext): void {
    this.dispatchReportValidated(data);
    ctx.getChannelRef().ack(ctx.getMessage());
  }

  private dispatchReportValidated(data: DomainEventEnvelope): void {
    this.dispatch(
      data,
      'report.validated',
      'notification:report-validated',
      `reportId=${String(data.payload['reportId'] ?? '?')}`,
    );
  }

  // ─── ged.request.created ─────────────────────────────────────────────────
  // Broadcast to the whole tenant room — all managers/admins connected will
  // receive this and can update their pending-count badge or show a toast.

  @EventPattern('ged.request.created.v1')
  handleGedRequestCreated(@Payload() data: DomainEventEnvelope, @Ctx() ctx: RmqContext): void {
    this.dispatch(
      data,
      'ged.request.created',
      'notification:ged-request-created',
      `requestId=${String(data.payload['requestId'] ?? '?')} title="${String(data.payload['title'] ?? '')}"`,
    );
    ctx.getChannelRef().ack(ctx.getMessage());
  }

  // ─── ged.request.fulfilled ────────────────────────────────────────────────
  // Broadcast to tenant room. The requester is also in the room and will see
  // their request status change in real-time.

  @EventPattern('ged.request.fulfilled.v1')
  handleGedRequestFulfilled(@Payload() data: DomainEventEnvelope, @Ctx() ctx: RmqContext): void {
    this.dispatch(
      data,
      'ged.request.fulfilled',
      'notification:ged-request-fulfilled',
      `requestId=${String(data.payload['requestId'] ?? '?')}`,
    );
    ctx.getChannelRef().ack(ctx.getMessage());
  }

  // ─── ged.request.rejected ─────────────────────────────────────────────────

  @EventPattern('ged.request.rejected.v1')
  handleGedRequestRejected(@Payload() data: DomainEventEnvelope, @Ctx() ctx: RmqContext): void {
    this.dispatch(
      data,
      'ged.request.rejected',
      'notification:ged-request-rejected',
      `requestId=${String(data.payload['requestId'] ?? '?')} comment="${String(data.payload['comment'] ?? '')}"`,
    );
    ctx.getChannelRef().ack(ctx.getMessage());
  }

  // ─── dlc.labels.expiring-today ────────────────────────────────────────────

  @EventPattern('dlc.labels.expiring-today')
  handleDlcExpiringToday(@Payload() data: DomainEventEnvelope, @Ctx() ctx: RmqContext): void {
    this.dispatchDlcExpiringToday(data);
    ctx.getChannelRef().ack(ctx.getMessage());
  }

  @EventPattern('dlc.labels.expiring-today.v1')
  handleDlcExpiringTodayV1(@Payload() data: DomainEventEnvelope, @Ctx() ctx: RmqContext): void {
    this.dispatchDlcExpiringToday(data);
    ctx.getChannelRef().ack(ctx.getMessage());
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

  // ─── printing.job.failed ──────────────────────────────────────────────────
  // Broadcast to tenant so admins see failed print jobs in real-time.

  @EventPattern('printing.job.failed.v1')
  handlePrintJobFailed(@Payload() data: DomainEventEnvelope, @Ctx() ctx: RmqContext): void {
    this.dispatch(
      data,
      'printing.job.failed',
      'notification:print-job-failed',
      `jobId=${String(data.payload['jobId'] ?? '?')} error="${String(data.payload['errorMessage'] ?? '')}"`,
    );
    ctx.getChannelRef().ack(ctx.getMessage());
  }

  // ─── printing.printer.offline ─────────────────────────────────────────────

  @EventPattern('printing.printer.offline.v1')
  handlePrinterOffline(@Payload() data: DomainEventEnvelope, @Ctx() ctx: RmqContext): void {
    this.dispatch(
      data,
      'printing.printer.offline',
      'notification:printer-offline',
      `printerId=${String(data.payload['printerId'] ?? '?')} name="${String(data.payload['printerName'] ?? '')}"`,
    );
    ctx.getChannelRef().ack(ctx.getMessage());
  }
}
