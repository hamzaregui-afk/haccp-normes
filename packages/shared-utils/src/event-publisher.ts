/**
 * event-publisher.ts
 *
 * ARCH-DECISION: Per-call AMQP connection is retained for low-frequency domain
 * events (< 10/min in typical HACCP operation). A shared persistent channel
 * would reduce latency further but adds reconnection state that is not justified
 * at current load.
 *
 * ARCH-DECISION: A module-level CircuitBreaker wraps every publish attempt.
 * After 5 consecutive RabbitMQ failures the circuit opens for 60 s — preventing
 * request threads from piling up on a downed broker. The circuit resets
 * automatically once the broker recovers. All failures are swallowed (domain
 * events must never block the main API response), but now they short-circuit
 * instead of timing out.
 *
 * ARCH-DECISION: Every event carries a stable `eventId` (UUID v4) so consumers
 * can deduplicate retried deliveries using the IdempotencyGuard.
 *
 * Event versioning convention: `<domain>.<entity>.<past-tense>.v1`
 *   e.g.  control.task.completed.v1
 *         nonconformity.nc.created.v1
 *         report.report.validated.v1
 */

import { circuitBreakerRegistry } from './circuit-breaker';

const NOTIFICATION_QUEUE    = 'haccp_notification_queue';
const AUDIT_QUEUE           = 'haccp_audit_queue';
const NONCONFORMITY_QUEUE   = 'haccp_nonconformity_queue';
const DLQ_QUEUE             = 'haccp_notification_dlq';

/**
 * ARCH-DECISION: Events that must also be routed to the nonconformity-service.
 * Only `control.task.completed` events trigger automatic NC creation.
 * Routing any other event to haccp_nonconformity_queue would produce
 * "unsupported event" nacks because the consumer only handles these two patterns.
 */
const NONCONFORMITY_EVENT_TYPES = new Set([
  'control.task.completed',
  'control.task.completed.v1',
]);

// ARCH-DECISION: Circuit breaker created once at module load so its failure
// counter persists across calls. Re-creating it on every publishDomainEvent()
// would reset the counter, defeating the purpose.
const rabbitCb = circuitBreakerRegistry.get('rabbitmq-publish', {
  failureThreshold: 5,
  timeout: 60_000,
  onOpen: (name) => {
    if (process.env['NODE_ENV'] !== 'production') {
      console.warn(`[EventPublisher] Circuit "${name}" OPEN — RabbitMQ unreachable`);
    }
  },
});

function getRabbitMqUrl(): string {
  return process.env['RABBITMQ_URL'] ?? 'amqp://guest:guest@localhost:5672';
}

export interface DomainEvent<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Routing key — follows <domain>.<entity>.<past-tense>.v1 convention */
  eventType: string;
  /** Tenant that owns this event — consumers must scope processing to this tenant */
  tenantId:  string;
  /** Domain-specific event data */
  payload:   T;
  /**
   * Correlation ID from the originating HTTP request.
   * Pass `req.headers['x-correlation-id']` so the event can be traced across
   * the full request chain including async consumers.
   */
  correlationId?: string;
}

/**
 * Publish a domain event to the shared notification queue.
 *
 * @example
 * void publishDomainEvent({
 *   eventType:     'nonconformity.nc.created.v1',
 *   tenantId:      user.tenantId,
 *   correlationId: req.headers['x-correlation-id'] as string,
 *   payload:       { ncId, severity, category, createdBy: user.sub },
 * });
 */
export async function publishDomainEvent(event: DomainEvent): Promise<void> {
  // ARCH-DECISION: Publish in parallel to all queues that subscribe to this
  // event type. notification-service and audit-service receive every event.
  // nonconformity-service only receives control.task.completed events because
  // those are the only patterns its consumer handles — routing other events to
  // its queue would produce unhandled-event nacks.
  const targets = [
    doPublish(event, NOTIFICATION_QUEUE),
    doPublish(event, AUDIT_QUEUE),
    ...(NONCONFORMITY_EVENT_TYPES.has(event.eventType)
      ? [doPublish(event, NONCONFORMITY_QUEUE)]
      : []),
  ];
  await rabbitCb.execute(
    () => Promise.all(targets).then(() => undefined),
    () => undefined, // fallback: swallow silently — domain events must not block the API
  );
}

/**
 * Send a message directly to the Dead Letter Queue.
 * Use when a consumer detects a poison message it cannot process after N retries.
 * Also wrapped in the circuit breaker so a downed broker doesn't cause a hang.
 */
export async function publishToDlq(
  originalEvent: DomainEvent,
  reason: string,
): Promise<void> {
  await rabbitCb.execute(
    () => doPublish(
      { ...originalEvent, payload: { ...originalEvent.payload, dlqReason: reason } },
      DLQ_QUEUE,
    ),
    () => undefined,
  );
}

// ─── Internal ─────────────────────────────────────────────────────────────────
async function doPublish(event: DomainEvent, queue: string): Promise<void> {
  // Dynamic import — services that never publish won't load amqplib at all
  const amqplib = await import('amqplib');
  const conn     = await amqplib.connect(getRabbitMqUrl());

  try {
    const channel = await conn.createChannel();
    try {
      await channel.assertQueue(queue, { durable: true });

      channel.sendToQueue(
        queue,
        Buffer.from(
          JSON.stringify({
            pattern: event.eventType,
            data: {
              tenantId:      event.tenantId,
              payload:       event.payload,
              eventId:       crypto.randomUUID(),
              correlationId: event.correlationId ?? 'unknown',
              timestamp:     new Date().toISOString(),
            },
          }),
        ),
        {
          persistent:  true,
          contentType: 'application/json',
          headers:     { 'x-correlation-id': event.correlationId ?? 'unknown' },
        },
      );
    } finally {
      await channel.close();
    }
  } finally {
    // Guarantee the TCP connection is always released, even if channel ops throw
    await conn.close();
  }
}
