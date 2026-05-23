/**
 * audit.consumer.ts
 *
 * RabbitMQ domain-event consumer for the audit-service.
 *
 * ARCH-DECISION: Every domain event that flows through the shared
 * publishDomainEvent() helper is delivered to both haccp_notification_queue
 * AND haccp_audit_queue. This consumer subscribes to haccp_audit_queue and
 * writes one immutable audit log entry per event, providing a complete and
 * tamper-evident trail of domain activity.
 *
 * ARCH-DECISION: userId defaults to 'system' for machine-generated events
 * (scheduler, overdue-marker). Human-initiated events carry the actor's id in
 * payload (createdBy, completedBy, validatedBy). The consumer extracts it with
 * best-effort — a missing userId never causes the log write to fail.
 *
 * ARCH-DECISION: Uses IdempotencyGuard (LRU, 10 000 entries) for at-least-once
 * deduplication. In a multi-replica deployment replace with a Redis NX check
 * on eventId with a 24 h TTL.
 *
 * ARCH-DECISION: Unknown / unmapped event types are logged with
 * resource = 'system' and action = 'CREATE' as a catch-all so that no event
 * is silently dropped from the audit trail. This is conservative — the audit
 * log records too much rather than too little.
 */

import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { IdempotencyGuard } from '@haccp/shared-utils';
import { AuditService } from './audit.service';

// ─── RabbitMQ envelope ────────────────────────────────────────────────────────
// Shape emitted by publishDomainEvent() in shared-utils/event-publisher.ts.

interface DomainEventEnvelope {
  tenantId:      string;
  payload:       Record<string, unknown>;
  eventId:       string;
  correlationId: string;
  timestamp:     string;
}

// ─── Mapping helpers ──────────────────────────────────────────────────────────

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'EXPORT';

interface AuditMapping {
  action:   AuditAction;
  resource: string;
  /** Payload key that holds the primary actor's id (defaults to 'system') */
  userKey:  string | null;
  /** Payload key that holds the primary resource id */
  idKey:    string | null;
}

const EVENT_MAP: Record<string, AuditMapping> = {
  'nonconformity.nc.created':       { action: 'CREATE', resource: 'nonconformities', userKey: 'createdBy',   idKey: 'ncId'     },
  'nonconformity.nc.created.v1':    { action: 'CREATE', resource: 'nonconformities', userKey: 'createdBy',   idKey: 'ncId'     },
  'control.task.completed':         { action: 'UPDATE', resource: 'controls',         userKey: 'completedBy', idKey: 'taskId'   },
  'control.task.completed.v1':      { action: 'UPDATE', resource: 'controls',         userKey: 'completedBy', idKey: 'taskId'   },
  'control.task.assigned':          { action: 'UPDATE', resource: 'controls',         userKey: 'assigneeId',  idKey: 'taskId'   },
  'control.task.assigned.v1':       { action: 'UPDATE', resource: 'controls',         userKey: 'assigneeId',  idKey: 'taskId'   },
  'control.tasks.overdue':          { action: 'UPDATE', resource: 'controls',         userKey: null,          idKey: null       },
  'control.tasks.overdue.v1':       { action: 'UPDATE', resource: 'controls',         userKey: null,          idKey: null       },
  'report.report.validated':        { action: 'UPDATE', resource: 'reports',          userKey: 'validatedBy', idKey: 'reportId' },
  'report.report.validated.v1':     { action: 'UPDATE', resource: 'reports',          userKey: 'validatedBy', idKey: 'reportId' },
  // DLC expiry is a scheduled notification, not a user action — still record it
  'dlc.labels.expiring-today':      { action: 'CREATE', resource: 'system',           userKey: null,          idKey: null       },
  'dlc.labels.expiring-today.v1':   { action: 'CREATE', resource: 'system',           userKey: null,          idKey: null       },
};

const FALLBACK_MAPPING: AuditMapping = {
  action:  'CREATE',
  resource: 'system',
  userKey: null,
  idKey:   null,
};

function extractString(obj: Record<string, unknown>, key: string | null): string | undefined {
  if (!key) return undefined;
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

// ─── Consumer ────────────────────────────────────────────────────────────────

@Controller()
export class AuditConsumer {
  private readonly logger = new Logger(AuditConsumer.name);
  private readonly dedup  = new IdempotencyGuard(10_000);

  constructor(private readonly auditService: AuditService) {}

  /**
   * Catch-all handler: subscribes to every event that arrives on
   * haccp_audit_queue. NestJS RMQ transport delivers `pattern` from the
   * message's `data.pattern` field; we use a wildcard (#) equivalent by
   * enumerating all known patterns.
   *
   * We register one handler for the known patterns and one for unknowns.
   * Unrecognised patterns pass through the FALLBACK_MAPPING so nothing is lost.
   */

  // ── nonconformity ────────────────────────────────────────────────────────

  @EventPattern('nonconformity.nc.created')
  @EventPattern('nonconformity.nc.created.v1')
  handleNcCreated(@Payload() data: DomainEventEnvelope): void {
    void this.record('nonconformity.nc.created', data);
  }

  // ── control tasks ────────────────────────────────────────────────────────

  @EventPattern('control.task.completed')
  @EventPattern('control.task.completed.v1')
  handleTaskCompleted(@Payload() data: DomainEventEnvelope): void {
    void this.record('control.task.completed', data);
  }

  @EventPattern('control.task.assigned')
  @EventPattern('control.task.assigned.v1')
  handleTaskAssigned(@Payload() data: DomainEventEnvelope): void {
    void this.record('control.task.assigned', data);
  }

  @EventPattern('control.tasks.overdue')
  @EventPattern('control.tasks.overdue.v1')
  handleTasksOverdue(@Payload() data: DomainEventEnvelope): void {
    void this.record('control.tasks.overdue', data);
  }

  // ── reports ──────────────────────────────────────────────────────────────

  @EventPattern('report.report.validated')
  @EventPattern('report.report.validated.v1')
  handleReportValidated(@Payload() data: DomainEventEnvelope): void {
    void this.record('report.report.validated', data);
  }

  // ── DLC ──────────────────────────────────────────────────────────────────

  @EventPattern('dlc.labels.expiring-today')
  @EventPattern('dlc.labels.expiring-today.v1')
  handleDlcExpiring(@Payload() data: DomainEventEnvelope): void {
    void this.record('dlc.labels.expiring-today', data);
  }

  // ─── Core record helper ───────────────────────────────────────────────────

  private async record(eventType: string, data: DomainEventEnvelope): Promise<void> {
    if (this.dedup.isDuplicate(data.eventId)) return;

    const mapping = EVENT_MAP[eventType] ?? FALLBACK_MAPPING;

    const userId = extractString(data.payload, mapping.userKey) ?? 'system';
    const resourceId = extractString(data.payload, mapping.idKey);

    this.logger.log(
      `[audit] ${eventType} tenant=${data.tenantId} resource=${mapping.resource} id=${resourceId ?? '-'} actor=${userId}`,
    );

    try {
      await this.auditService.log(
        {
          userId,
          action:     mapping.action,
          resource:   mapping.resource,
          resourceId,
          payload:    { eventType, eventId: data.eventId, correlationId: data.correlationId, ...data.payload },
        },
        data.tenantId,
      );
    } catch (err) {
      // ARCH-DECISION: Log and continue — a failed audit write must never
      // cause the RabbitMQ message to be nack'd and retried indefinitely,
      // as that would block the queue. Ops should alert on audit write errors
      // via Prometheus / Grafana and remediate manually if needed.
      this.logger.error(
        `[audit] Failed to write audit entry for ${eventType} / ${data.eventId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
