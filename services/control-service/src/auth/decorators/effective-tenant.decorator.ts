/**
 * effective-tenant.decorator.ts
 *
 * Controller param decorators for the multi-tenant supervision seam.
 *
 * - `@EffectiveTenant()` → the resolved effective `tenantId` (string). This is
 *   the drop-in replacement for `@CurrentUser() user` + `user.tenantId` on
 *   tenant-scoped endpoints. For a normal user it is always their own tenant;
 *   for a SUPER_ADMIN it is the tenant they selected via `X-Selected-Tenant`
 *   (or 'platform' when none). In ALL aggregation mode there is no single
 *   tenantId, so this decorator throws 400 — such endpoints must use
 *   `@TenantScope()` and handle ALL explicitly.
 *
 * - `@TenantScope()` → the full `EffectiveTenantContext` (mode + tenantId +
 *   flags), for aggregation endpoints that support ALL.
 *
 * Both prefer the context stashed by TenantContextGuard and fall back to
 * resolving on the spot (so a controller works whether or not the guard is
 * wired). The 403 for a normal user selecting another tenant is enforced by
 * resolveOrForbid either way.
 */

import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import {
  type JwtPayload,
  type EffectiveTenantContext,
  SELECTED_TENANT_HEADER,
} from '@haccp/shared-types';
import { EFFECTIVE_TENANT_CTX, resolveOrForbid } from '../guards/tenant-context.guard';

interface TenantRequest {
  user?: JwtPayload;
  headers: Record<string, string | string[] | undefined>;
  [EFFECTIVE_TENANT_CTX]?: EffectiveTenantContext;
}

function contextOf(ctx: ExecutionContext): EffectiveTenantContext {
  const req = ctx.switchToHttp().getRequest<TenantRequest>();
  const cached = req[EFFECTIVE_TENANT_CTX];
  if (cached) return cached;
  if (!req.user) {
    throw new BadRequestException('No authenticated user in request');
  }
  return resolveOrForbid(req.user, req.headers[SELECTED_TENANT_HEADER]);
}

export const EffectiveTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const tc = contextOf(ctx);
    if (tc.effectiveTenantId === null) {
      throw new BadRequestException(
        'This endpoint requires a single tenant selection (aggregation mode ALL is not supported here).',
      );
    }
    return tc.effectiveTenantId;
  },
);

export const TenantScope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): EffectiveTenantContext => contextOf(ctx),
);
