/**
 * correlation-id.middleware.ts
 *
 * ARCH-DECISION: Correlation ID is generated once at the nginx edge and
 * forwarded via X-Correlation-ID header to every upstream service. If nginx
 * already set it (via $request_id), we preserve it; otherwise we generate
 * one here so local / dev requests without a gateway also get traced.
 *
 * Usage in any NestJS service main.ts:
 *   app.use(correlationIdMiddleware);
 *
 * Usage in RabbitMQ handlers:
 *   const correlationId = msg.properties.headers?.['x-correlation-id'] ?? 'unknown';
 */
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Plain Express middleware — no @nestjs/common dependency needed,
 * registers via `app.use(correlationIdMiddleware)` in bootstrap.
 */
export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const existing = req.headers[CORRELATION_ID_HEADER];
  const correlationId =
    typeof existing === 'string' && existing.length > 0
      ? existing
      : randomUUID();

  req.headers[CORRELATION_ID_HEADER] = correlationId;

  // Echo back so clients can correlate their own logs
  res.setHeader('X-Correlation-ID', correlationId);

  next();
}

/** Typed helper to read the correlation ID from an incoming request. */
export function getCorrelationId(req: Request): string {
  const value = req.headers[CORRELATION_ID_HEADER];
  return typeof value === 'string' ? value : 'unknown';
}
