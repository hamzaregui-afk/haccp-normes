/**
 * outbox.ts — Transactional Outbox Pattern types & base worker
 *
 * ARCH-DECISION: The Outbox pattern solves the "dual-write" problem:
 * when a service must write to its own DB AND publish a message to RabbitMQ,
 * a crash between the two leaves the system in an inconsistent state.
 *
 * Solution:
 *   1. Write business entity + outbox_event row in a SINGLE DB transaction.
 *   2. A separate OutboxWorker polls `outbox_events WHERE status = 'PENDING'`,
 *      publishes each to RabbitMQ, then marks it `PUBLISHED` — all idempotent.
 *   3. If the service crashes after the DB write but before publishing, the
 *      worker retries on restart. RabbitMQ consumers must be idempotent (check
 *      eventId) to handle the rare duplicate-delivery case.
 *
 * Each service adds this table to its Prisma schema:
 *
 *   model OutboxEvent {
 *     id          String   @id @default(uuid())
 *     eventType   String                              // e.g. "control.task.completed.v1"
 *     tenantId    String
 *     payload     Json
 *     status      OutboxEventStatus @default(PENDING)
 *     retries     Int      @default(0)
 *     createdAt   DateTime @default(now())
 *     processedAt DateTime?
 *     @@index([status, createdAt])
 *   }
 *
 *   enum OutboxEventStatus { PENDING PUBLISHED FAILED }
 *
 * The concrete OutboxWorker is instantiated per service (it needs the
 * service's own PrismaClient). See services/*/src/outbox/outbox.worker.ts.
 */

/** Mirrors the Prisma OutboxEvent model — no Prisma import required here. */
export interface OutboxEventRow {
  id:          string;
  eventType:   string;
  tenantId:    string;
  payload:     Record<string, unknown>;
  status:      'PENDING' | 'PUBLISHED' | 'FAILED';
  retries:     number;
  createdAt:   Date;
  processedAt: Date | null;
}

export interface OutboxEventCreate {
  eventType: string;
  tenantId:  string;
  payload:   Record<string, unknown>;
}

/**
 * Abstract base that concrete OutboxWorkers extend.
 * Subclass must implement `fetchPending`, `markPublished`, and `markFailed`.
 *
 * @example
 * // services/control-service/src/outbox/outbox.worker.ts
 * export class ControlOutboxWorker extends BaseOutboxWorker {
 *   constructor(private readonly prisma: PrismaClient) { super(); }
 *   protected fetchPending() { return this.prisma.outboxEvent.findMany({ where: { status: 'PENDING' }, take: 50, orderBy: { createdAt: 'asc' } }); }
 *   protected markPublished(id: string) { return this.prisma.outboxEvent.update({ where: { id }, data: { status: 'PUBLISHED', processedAt: new Date() } }); }
 *   protected markFailed(id: string, retries: number) { return this.prisma.outboxEvent.update({ where: { id }, data: { status: retries >= 5 ? 'FAILED' : 'PENDING', retries: retries + 1 } }); }
 * }
 */
export abstract class BaseOutboxWorker {
  private running = false;

  protected abstract fetchPending(): Promise<OutboxEventRow[]>;
  protected abstract markPublished(id: string): Promise<void>;
  protected abstract markFailed(id: string, retries: number): Promise<void>;

  /**
   * Publish one event to RabbitMQ.
   * Override to inject your AMQP channel / NestJS ClientProxy.
   */
  protected abstract publish(event: OutboxEventRow): Promise<void>;

  /** Call from a @Cron() or setInterval — typically every 5 seconds. */
  async processAll(): Promise<void> {
    // Re-entrancy guard: check and set before any async work
    if (this.running) return;
    this.running = true;

    try {
      const events = await this.fetchPending();
      if (events.length > 0) {
        await Promise.allSettled(events.map((e) => this.processSingle(e)));
      }
    } finally {
      this.running = false;
    }
  }

  private async processSingle(event: OutboxEventRow): Promise<void> {
    try {
      await this.publish(event);
      await this.markPublished(event.id);
    } catch {
      await this.markFailed(event.id, event.retries);
    }
  }
}

/**
 * Idempotency helper: wraps a handler and skips processing if the eventId
 * was seen recently.
 *
 * ARCH-DECISION: In-memory Set is sufficient for single-replica services.
 * For multi-replica deployments, replace with a Redis SETNX check on the
 * eventId with a TTL of ≈ 24 h (well beyond the RabbitMQ redelivery window).
 *
 * @example
 *   const guard = new IdempotencyGuard(1000);
 *   if (guard.isDuplicate(data.eventId)) return;  // ACK and skip
 */
export class IdempotencyGuard {
  private readonly seen: Set<string>;

  constructor(private readonly maxSize: number = 10_000) {
    this.seen = new Set();
  }

  isDuplicate(eventId: string): boolean {
    if (this.seen.has(eventId)) return true;

    // Evict oldest entries when the set grows too large
    if (this.seen.size >= this.maxSize) {
      const firstKey = this.seen.values().next().value;
      if (firstKey !== undefined) this.seen.delete(firstKey);
    }

    this.seen.add(eventId);
    return false;
  }

  clear(): void {
    this.seen.clear();
  }
}
