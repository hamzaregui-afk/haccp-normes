/**
 * tenant-context.ts — packages/shared-types
 *
 * Framework-agnostic core for SUPER_ADMIN multi-tenant supervision.
 *
 * Resolves the "effective tenant" a request operates on, from the authenticated
 * user (already extracted from the verified JWT) and an optional
 * `X-Selected-Tenant` request header set by the SUPER_ADMIN client selector.
 *
 * ARCH-DECISION: this lives in shared-types — already a dependency of every
 * service and already compiled into every Docker image (`COPY packages/`) — so
 * the resolution rules AND the cross-tenant 403 decision are single-sourced and
 * unit-tested in ONE place, instead of being copy-pasted like the per-service
 * auth guards. The thin NestJS guard/decorator that call into this stay
 * per-service (they only wrap `resolveEffectiveTenant` + map the error to a
 * ForbiddenException), matching the existing auth-folder convention.
 *
 * Isolation invariant preserved: a non-SUPER_ADMIN user can NEVER widen scope
 * via this header — a header naming a different tenant is rejected. The header
 * only ever means something for a SUPER_ADMIN token.
 */

import type { JwtPayload } from './user.types';

/**
 * Header the frontend sends to select a tenant to supervise.
 * Lowercase on purpose — Node/Express normalise incoming header names to
 * lowercase, so consumers must read `req.headers['x-selected-tenant']`.
 * ARCH-DECISION: a header (not a URL/query param) keeps the tenantId out of
 * URLs, logs and browser history, and rides through the nginx gateway
 * unchanged (custom headers are proxied by default).
 */
export const SELECTED_TENANT_HEADER = 'x-selected-tenant';

/**
 * Sentinel a SUPER_ADMIN sends in {@link SELECTED_TENANT_HEADER} to request
 * cross-tenant aggregation ("Tous les clients"). Never a real tenantId.
 */
export const ALL_TENANTS = 'ALL';

/**
 * Sentinel tenantId carried by a SUPER_ADMIN JWT (minted by auth-service at
 * login). It never matches a real tenant row, so an un-scoped SUPER_ADMIN
 * request reads platform-level (empty) business data rather than another
 * tenant's — this is the "PLATFORM" management context.
 */
export const PLATFORM_TENANT = 'platform';

/**
 * How the current request is scoped:
 * - `PLATFORM` — SUPER_ADMIN with no selection (platform backoffice context).
 * - `SINGLE`   — one tenant (a normal user's own tenant, or a SUPER_ADMIN's pick).
 * - `ALL`      — SUPER_ADMIN aggregation across tenants (read/stats only).
 */
export type TenantSelectionMode = 'PLATFORM' | 'SINGLE' | 'ALL';

export interface EffectiveTenantContext {
  /** Scope of this request. */
  mode: TenantSelectionMode;
  /**
   * The tenantId every query MUST be scoped to. A concrete string for
   * `PLATFORM` and `SINGLE`; `null` in `ALL` mode (aggregation endpoints must
   * resolve per-tenant instead of relying on a single value).
   */
  effectiveTenantId: string | null;
  /** True only for a SUPER_ADMIN acting with global scope. */
  isSuperAdmin: boolean;
  /**
   * The raw value the SUPER_ADMIN selected (a tenantId or {@link ALL_TENANTS}),
   * or `null` when no selection was made / the caller is a normal user.
   * Kept for audit logging of supervision context switches.
   */
  selectedTenantId: string | null;
}

/**
 * Thrown by {@link resolveEffectiveTenant} when a non-SUPER_ADMIN caller sends
 * a selection header naming a tenant other than their own. The NestJS guard
 * maps this to a 403 ForbiddenException.
 */
export class CrossTenantAccessError extends Error {
  constructor(
    public readonly authenticatedTenantId: string,
    public readonly requestedTenantId: string,
  ) {
    super('Cross-tenant access denied');
    this.name = 'CrossTenantAccessError';
    // Restore prototype chain for `instanceof` after transpilation to ES5/CJS.
    Object.setPrototypeOf(this, CrossTenantAccessError.prototype);
  }
}

const isSuperAdmin = (user: Pick<JwtPayload, 'role'>): boolean =>
  user.role === 'SUPER_ADMIN';

/**
 * Central authorization rule: may `user` operate on `tenantId`?
 *
 * Kept deliberately LOCAL (no cross-service call, honouring the no-cross-service
 * -DB-join rule): SUPER_ADMIN → any tenant; every other role → only their own
 * JWT tenant. Existence/active checks for a SUPER_ADMIN's target tenant are
 * enforced where the tenant table actually lives (tenant-service) and by the
 * frontend selector; a bogus id here merely yields empty results — never a leak.
 */
export function canAccessTenant(
  user: Pick<JwtPayload, 'role' | 'tenantId'>,
  tenantId: string,
): boolean {
  if (isSuperAdmin(user)) return true;
  return user.tenantId === tenantId;
}

/**
 * Resolve the {@link EffectiveTenantContext} for a request.
 *
 * Rules:
 * - Normal roles: the header is ignored when absent or equal to their own
 *   tenant; a header naming a DIFFERENT tenant throws
 *   {@link CrossTenantAccessError} (defense-in-depth — legitimate clients never
 *   send it, so this only ever fires on tampering).
 * - SUPER_ADMIN + no header → `PLATFORM` (their JWT tenantId, i.e. 'platform').
 * - SUPER_ADMIN + `ALL`     → `ALL` (aggregation; effectiveTenantId = null).
 * - SUPER_ADMIN + tenantId  → `SINGLE` (effectiveTenantId = that tenant).
 *
 * @param user           the authenticated principal (role + tenantId suffice).
 * @param selectedHeader the raw `X-Selected-Tenant` header value, if any.
 */
export function resolveEffectiveTenant(
  user: Pick<JwtPayload, 'role' | 'tenantId'>,
  selectedHeader: string | null | undefined,
): EffectiveTenantContext {
  const selected =
    typeof selectedHeader === 'string' && selectedHeader.trim().length > 0
      ? selectedHeader.trim()
      : null;

  if (isSuperAdmin(user)) {
    if (selected === null) {
      return {
        mode: 'PLATFORM',
        effectiveTenantId: user.tenantId,
        isSuperAdmin: true,
        selectedTenantId: null,
      };
    }
    // Case-insensitive so a hand-crafted 'all'/'All' header still aggregates
    // rather than being mistaken for a literal tenantId (cuids never equal 'ALL').
    if (selected.toUpperCase() === ALL_TENANTS) {
      return {
        mode: 'ALL',
        effectiveTenantId: null,
        isSuperAdmin: true,
        selectedTenantId: ALL_TENANTS,
      };
    }
    return {
      mode: 'SINGLE',
      effectiveTenantId: selected,
      isSuperAdmin: true,
      selectedTenantId: selected,
    };
  }

  // Non-super-admin: bound to their own tenant, full stop.
  if (selected !== null && selected !== user.tenantId) {
    throw new CrossTenantAccessError(user.tenantId, selected);
  }
  return {
    mode: 'SINGLE',
    effectiveTenantId: user.tenantId,
    isSuperAdmin: false,
    selectedTenantId: null,
  };
}

/**
 * Non-throwing convenience for the JWT strategy — returns the single tenantId a
 * request should be scoped to, so `@CurrentUser().tenantId` becomes the
 * "effective" tenant everywhere without touching a single controller.
 *
 * ARCH-DECISION: this is the ONE chokepoint (every authenticated request passes
 * through the JWT strategy) that makes SUPER_ADMIN tenant selection flow to all
 * modules at once — no per-endpoint migration, no risk of missing a route.
 *
 * - The header is honoured ONLY for SUPER_ADMIN. For every other role the
 *   caller's own JWT tenant is returned and the header is IGNORED (never
 *   throws) — a stray/forged header therefore cannot trigger a 401 → refresh →
 *   logout loop, and cannot widen scope (own tenant only = no leak).
 * - SUPER_ADMIN + a selected tenantId → that tenant (SINGLE cockpit).
 * - SUPER_ADMIN + ALL or no selection → the JWT's own tenantId (the 'platform'
 *   sentinel), so ordinary list endpoints stay empty; ALL-mode aggregation is
 *   served separately by endpoints that read {@link resolveEffectiveTenant}
 *   via `@TenantScope()`.
 */
export function resolveRequestTenantId(
  user: Pick<JwtPayload, 'role' | 'tenantId'>,
  rawHeader: string | string[] | null | undefined,
): string {
  if (!isSuperAdmin(user)) return user.tenantId;
  const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const ctx = resolveEffectiveTenant(user, header); // super-admin path never throws
  return ctx.effectiveTenantId ?? user.tenantId;
}

/**
 * Backend per-tenant MODULE enforcement mode (from the MODULE_ENFORCEMENT env).
 * - 'off'    → module gates disabled (guard is a no-op).
 * - 'log'    → a request for a module the tenant does not have is ALLOWED but
 *              logged (safe staged rollout: observe real usage before blocking).
 * - 'strict' → such a request is blocked with 403.
 *
 * ARCH-DECISION: default is 'log', so wiring the ModuleGuard changes NO behaviour
 * in production until an operator sets MODULE_ENFORCEMENT=strict — the tenant
 * module toggles were historically enforced nowhere, and flipping straight to
 * 'strict' could 403 tenants relying on a module that was disabled but reachable.
 */
export type ModuleEnforcementMode = 'off' | 'log' | 'strict';

export function parseModuleEnforcement(raw: string | null | undefined): ModuleEnforcementMode {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'strict': return 'strict';
    case 'off':    return 'off';
    default:       return 'log';
  }
}
