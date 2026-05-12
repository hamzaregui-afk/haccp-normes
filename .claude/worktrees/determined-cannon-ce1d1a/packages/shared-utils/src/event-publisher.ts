/**
 * event-publisher.ts
 *
 * Fire-and-forget domain event publisher for RabbitMQ.
 *
 * ARCH-DECISION: Messages are formatted in the NestJS @nestjs/microservices
 * AMQP envelope format ({ pattern, data }) so that notification-service can
 * consume them with @EventPattern decorators without any custom deserializer.
 *
 * ARCH-DECISION: A new AMQP connection is created per publish call rather than
 * maintaining a shared connection. Domain events are low-frequency (< 10/min
 * in typical HACCP operation), so the connection overhead is negligible and
 * avoids the complexity of reconnection logic in a shared utility. This mirrors
 * the emitAuditEvent pattern: simple, stateless, resilient.
 *
 * ARCH-DECISION: All failures are swallowed silently. Domain event delivery
 * is best-effort — a downed RabbitMQ must never break the main API response.
 * Critical traceability is covered by the append-only audit log; RabbitMQ
 * events are for real-time UX (WebSocket push + email), not regulatory records.
 */

const NOTIFICATION_QUEUE = 'haccp_notification_queue';

function getRabbitMqUrl(): string {
  return process.env['RABBITMQ_URL'] ?? 'amqp://guest:guest@localhost:5672';
}

export interface DomainEvent<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Routing key / event type — follows <domain>.<entity>.<past-tense> convention */
  eventType: string;
  /** Tenant that owns this event — consumers scope processing to this tenant */
  tenantId:  string;
  /** Domain-specific event data */
  payload:   T;
}

/**
 * Publish a domain event to the shared notification queue.
 *
 * @example
 * void publishDomainEvent({
 *   eventType: 'nonconformity.nc.created',
 *   tenantId:  user.tenantId,
 *   payload:   { ncId, severity, category, createdBy: user.sub },
 * });
 */
export async function publishDomainEvent(event: DomainEvent): Promise<void> {
  try {
    // Dynamic import — services that never publish won't load amqplib at all
    const amqplib = await import('amqplib');
    const conn    = await amqplib.connect(getRabbitMqUrl());
    const channel = await conn.createChannel();

    await channel.assertQueue(NOTIFICATION_QUEUE, { durable: true });

    channel.sendToQueue(
      NOTIFICATION_QUEUE,
      // Wrap in NestJS microservices AMQP envelope
      Buffer.from(
        JSON.stringify({
          pattern: event.eventType,
          data: {
            tenantId:  event.tenantId,
            payload:   event.payload,
            eventId:   crypto.randomUUID(),
            timestamp: new Date().toISOString(),
          },
        }),
      ),
      { persistent: true, contentType: 'application/json' },
    );

    await channel.close();
    await conn.close();
  } catch (err) {
    if (process.env['NODE_ENV'] !== 'production') {
      console.warn(
        `[EventPublisher] Failed to publish "${event.eventType}":`,
        (err as Error).message,
      );
    }
    // Domain events must never block the main request — swallow all errors
  }
}
