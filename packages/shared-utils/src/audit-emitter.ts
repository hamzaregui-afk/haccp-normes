/**
 * audit-emitter.ts
 *
 * Fire-and-forget utility for emitting audit log entries to the audit-service.
 *
 * ARCH-DECISION: We use Node's built-in `fetch` (available Node 18+, required
 * by NestJS 10) instead of axios to keep this package dependency-free.
 * The call is explicitly NOT awaited by callers — if the audit-service is
 * unavailable, we log a warning but NEVER throw, so the main request succeeds.
 *
 * Usage (inside a NestJS service / controller):
 *   import { emitAuditEvent } from '@haccp/shared-utils';
 *
 *   // Fire-and-forget — do NOT await
 *   void emitAuditEvent({
 *     userId:     user.sub,
 *     action:     'LOGIN',
 *     resource:   'users',
 *     resourceId: user.sub,
 *     tenantId:   user.tenantId,
 *     payload:    { email: user.email },
 *   });
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditEventPayload {
  /** ID of the user performing the action (from JWT sub). */
  userId: string;
  /** Audit action verb — matches AuditActionSchema in audit-service. */
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'EXPORT';
  /** Resource type being acted on (e.g. "users", "products"). */
  resource: string;
  /** ID of the specific resource, if applicable. */
  resourceId?: string;
  /** Tenant that owns this event (from JWT tenantId). */
  tenantId: string;
  /** Optional structured metadata for the event. */
  payload?: Record<string, unknown>;
}

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Internal audit-service base URL.
 * Override via AUDIT_SERVICE_URL env var (e.g. for Docker: http://audit-service:3019).
 * Defaults to localhost for local development.
 */
function getAuditServiceUrl(): string {
  return (
    (typeof process !== 'undefined' && process.env['AUDIT_SERVICE_URL']) ||
    'http://localhost:3019'
  );
}

function getInternalSecret(): string {
  return (
    (typeof process !== 'undefined' && process.env['INTERNAL_SERVICE_SECRET']) ||
    'haccp-internal-dev-secret-change-in-prod'
  );
}

// ─── Emitter ──────────────────────────────────────────────────────────────────

/**
 * Emits an audit event to the audit-service internal endpoint.
 *
 * NEVER throws — failures are swallowed with a console.warn so that the
 * calling service's main request flow is never disrupted by audit failures.
 *
 * Returns a Promise so callers can optionally await it (e.g. in integration tests),
 * but in production code always call with `void emitAuditEvent(...)`.
 */
export async function emitAuditEvent(event: AuditEventPayload): Promise<void> {
  try {
    const url = `${getAuditServiceUrl()}/internal/audit`;
    const response = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':     'application/json',
        'X-Internal-Secret': getInternalSecret(),
      },
      body: JSON.stringify(event),
      // Short timeout — audit failure must NOT block the caller
      signal: AbortSignal.timeout(2_000),
    });

    if (!response.ok) {
      console.warn(
        `[AuditEmitter] audit-service responded ${response.status} for action=${event.action} resource=${event.resource}`,
      );
    }
  } catch (err: unknown) {
    // Network errors, timeouts, service unavailable — swallow silently in prod
    if (process.env['NODE_ENV'] !== 'production') {
      console.warn('[AuditEmitter] Failed to emit audit event:', (err as Error).message);
    }
  }
}
