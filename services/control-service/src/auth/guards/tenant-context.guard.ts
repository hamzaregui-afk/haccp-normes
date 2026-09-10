/**
 * tenant-context.guard.ts
 *
 * Resolves the "effective tenant" for the request — honouring an
 * `X-Selected-Tenant` header for SUPER_ADMIN — and stashes it on the request
 * for `@EffectiveTenant()` / `@TenantScope()` to read.
 *
 * MUST run AFTER JwtAuthGuard so `req.user` is populated:
 *   @UseGuards(JwtAuthGuard, RolesGuard, TenantContextGuard)
 *
 * ARCH-DECISION: the resolution rules and the cross-tenant 403 decision live in
 * @haccp/shared-types (single-sourced, unit-tested). This guard is a thin
 * NestJS adapter — it maps CrossTenantAccessError to a 403 ForbiddenException.
 * It is optional: the param decorators fall back to resolving on the spot when
 * the guard is not wired, so a controller works either way.
 */

import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  type JwtPayload,
  type EffectiveTenantContext,
  SELECTED_TENANT_HEADER,
  CrossTenantAccessError,
  resolveEffectiveTenant,
} from '@haccp/shared-types';

/** Request property under which the resolved context is stashed. */
export const EFFECTIVE_TENANT_CTX = 'effectiveTenant';

interface TenantRequest {
  user?: JwtPayload;
  headers: Record<string, string | string[] | undefined>;
  [EFFECTIVE_TENANT_CTX]?: EffectiveTenantContext;
}

/**
 * Resolve the effective tenant or translate a cross-tenant violation into a
 * 403. Shared by the guard and the param decorators so the mapping lives once.
 */
export function resolveOrForbid(
  user: JwtPayload,
  rawHeader: string | string[] | undefined,
): EffectiveTenantContext {
  const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  try {
    return resolveEffectiveTenant(user, header);
  } catch (err) {
    if (err instanceof CrossTenantAccessError) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    throw err;
  }
}

@Injectable()
export class TenantContextGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<TenantRequest>();
    // Unauthenticated path — JwtAuthGuard owns rejection; nothing to resolve.
    if (!req.user) return true;
    req[EFFECTIVE_TENANT_CTX] = resolveOrForbid(req.user, req.headers[SELECTED_TENANT_HEADER]);
    return true;
  }
}
