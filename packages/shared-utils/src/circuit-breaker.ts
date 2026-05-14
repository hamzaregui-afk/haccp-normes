/**
 * circuit-breaker.ts
 *
 * ARCH-DECISION: Implemented as a pure, dependency-free TypeScript class so any
 * service (HTTP, AMQP consumer, cron worker) can use it without NestJS coupling.
 *
 * State machine:
 *   CLOSED  → normal operation; failures increment counter
 *   OPEN    → fast-fail; no calls reach the target; timer gates HALF_OPEN
 *   HALF_OPEN → probe: 1+ success → CLOSED, failure → OPEN (new timeout)
 *
 * Usage:
 *   const cb = new CircuitBreaker('minio-upload', { failureThreshold: 3, timeout: 30_000 });
 *   const url = await cb.execute(
 *     () => minioClient.presignedGetObject(bucket, key, 3600),
 *     () => `/api/v1/assets/fallback/${key}`,   // fallback value
 *   );
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening. Default: 5 */
  failureThreshold?: number;
  /** Number of consecutive successes in HALF_OPEN before closing. Default: 2 */
  successThreshold?: number;
  /** Milliseconds to stay OPEN before probing. Default: 60_000 */
  timeout?: number;
  /** Called when circuit transitions to OPEN */
  onOpen?: (name: string) => void;
  /** Called when circuit transitions back to CLOSED */
  onClose?: (name: string) => void;
  /** Called when circuit transitions to HALF_OPEN (probe mode) */
  onHalfOpen?: (name: string) => void;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private nextAttemptAt = 0;

  constructor(
    private readonly name: string,
    private readonly options: CircuitBreakerOptions = {},
  ) {}

  private get failureThreshold(): number { return this.options.failureThreshold ?? 5; }
  private get successThreshold(): number { return this.options.successThreshold ?? 2; }
  private get timeout(): number          { return this.options.timeout ?? 60_000; }

  /**
   * Execute `fn` through the circuit breaker.
   * If the circuit is OPEN and the timeout has not elapsed, the call either
   * returns the `fallback` value or throws immediately without calling `fn`.
   *
   * @param fn       - The operation to protect
   * @param fallback - Optional value/function to return when the circuit is OPEN
   */
  async execute<T>(
    fn: () => Promise<T>,
    fallback?: () => T | Promise<T>,
  ): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptAt) {
        // Still within the open window — fast-fail
        if (fallback) return fallback();
        throw new CircuitOpenError(this.name);
      }
      // Timeout elapsed — probe with one request
      this.transitionTo('HALF_OPEN');
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure();
      if (fallback) return fallback();
      throw err;
    }
  }

  private recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.transitionTo('CLOSED');
      }
    } else {
      // Reset failure streak on any success in CLOSED state
      this.failureCount = 0;
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  private transitionTo(next: CircuitState): void {
    this.state = next;

    if (next === 'OPEN') {
      this.nextAttemptAt = Date.now() + this.timeout;
      this.failureCount  = 0;
      this.successCount  = 0;
      this.options.onOpen?.(this.name);
    } else if (next === 'HALF_OPEN') {
      this.successCount = 0;
      this.options.onHalfOpen?.(this.name);
    } else {
      this.failureCount = 0;
      this.successCount = 0;
      this.options.onClose?.(this.name);
    }
  }

  getState(): CircuitState { return this.state; }

  /** Force-reset for testing. */
  reset(): void {
    this.state        = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptAt = 0;
  }
}

export class CircuitOpenError extends Error {
  constructor(circuitName: string) {
    super(`Circuit "${circuitName}" is OPEN — request rejected (fast-fail)`);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Registry that holds named CircuitBreaker instances for the process lifetime.
 * Avoids creating a new breaker on every request.
 *
 * @example
 *   const cb = circuitBreakerRegistry.get('rabbitmq', { failureThreshold: 3 });
 *   await cb.execute(() => channel.sendToQueue(...));
 */
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  get(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
    const existing = this.breakers.get(name);
    if (existing) return existing;
    const cb = new CircuitBreaker(name, options);
    this.breakers.set(name, cb);
    return cb;
  }

  resetAll(): void {
    this.breakers.forEach((cb) => cb.reset());
  }
}

/** Process-wide singleton registry */
export const circuitBreakerRegistry = new CircuitBreakerRegistry();
