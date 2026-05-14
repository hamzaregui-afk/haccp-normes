/**
 * idempotency.middleware.ts
 *
 * ARCH-DECISION: HTTP Idempotency for state-mutating endpoints (POST, PATCH,
 * DELETE). Clients that may retry on network failure (mobile app with poor
 * connectivity, retry logic in the API gateway) send an Idempotency-Key header.
 * The server caches the response for that key and returns the same response on
 * retries without re-executing the handler — preventing duplicate NCs, tasks, etc.
 *
 * Storage strategy:
 *   - In-process LRU cache (Map) with TTL for single-replica services.
 *   - For multi-replica deployments, replace with Redis: `SET key response EX 86400 NX`.
 *     The Redis key guarantees only one replica executes the handler (NX = only
 *     if not exists) and all replicas return the cached response for retries.
 *
 * Usage in main.ts:
 *   import { idempotencyMiddleware } from '@haccp/shared-utils';
 *   app.use('/api/v1', idempotencyMiddleware);
 *
 * Client usage:
 *   POST /api/v1/controls/tasks
 *   Idempotency-Key: <uuid-v4>          ← generated once per logical operation
 *   → 200 { data: { id: "..." } }       ← first call executes
 *   → 200 { data: { id: "..." } }       ← retry returns cached response
 *
 * IMPORTANT: Only idempotency-key'd POST/PATCH/DELETE requests are cached.
 *   GET, HEAD, OPTIONS are always safe to re-execute (RFC 7231).
 */

import type { NextFunction, Request, Response } from 'express';

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const CACHE_TTL_MS           = 24 * 60 * 60 * 1_000; // 24 h
const MAX_CACHE_SIZE         = 5_000;                 // ~5 MB estimated (1 KB avg response)

interface CacheEntry {
  statusCode: number;
  body:       unknown;
  expiresAt:  number;
}

// Process-lifetime cache — acceptable for single-replica (or replace with Redis)
const cache = new Map<string, CacheEntry>();

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt < now) cache.delete(key);
  }
}

function evictOldest(): void {
  const oldest = cache.keys().next().value;
  if (oldest !== undefined) cache.delete(oldest);
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Express middleware that enables idempotent POST/PATCH/DELETE requests.
 * Safe methods (GET, HEAD, OPTIONS) pass through immediately.
 */
export function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const rawKey = req.headers[IDEMPOTENCY_KEY_HEADER];
  if (!rawKey) {
    // No key → not an idempotency-aware request, pass through
    next();
    return;
  }

  const idempotencyKey = `${req.method}:${req.path}:${String(rawKey)}`;

  // Lazy eviction of expired entries
  if (cache.size > MAX_CACHE_SIZE / 2) evictExpired();

  const cached = cache.get(idempotencyKey);
  if (cached) {
    if (cached.expiresAt > Date.now()) {
      // Cache hit — return stored response
      res.setHeader('Idempotency-Replayed', 'true');
      res.status(cached.statusCode).json(cached.body);
      return;
    }
    // Expired — remove and re-execute
    cache.delete(idempotencyKey);
  }

  // Intercept the response to cache it before sending
  const originalJson = res.json.bind(res);

  res.json = (body: unknown): Response => {
    if (res.statusCode < 500) {
      // Only cache successful and client-error responses, not 5xx
      if (cache.size >= MAX_CACHE_SIZE) evictOldest();
      cache.set(idempotencyKey, {
        statusCode: res.statusCode,
        body,
        expiresAt:  Date.now() + CACHE_TTL_MS,
      });
    }
    return originalJson(body);
  };

  next();
}
