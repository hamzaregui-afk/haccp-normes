/**
 * module.guard.ts
 *
 * Guards a route by checking that the authenticated user's tenant has the
 * required module enabled (carried in the JWT allowedModules array).
 *
 * Usage:
 *   @UseGuards(JwtAuthGuard, ModuleGuard)
 *   @RequireModule('HACCP_CONTROLS')
 *   @Get()
 *   findAll() { ... }
 *
 * ARCH-DECISION: SUPER_ADMIN bypasses all module checks — they have global
 * access to every module regardless of the tenant they're operating in.
 * Empty allowedModules (e.g., old tokens without the field) is treated as
 * "no access" for non-SUPER_ADMIN users, forcing re-login after deploy.
 */

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtPayload } from '@haccp/shared-types';

export const MODULE_KEY = 'requiredModule';

@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredModule = this.reflector.getAllAndOverride<string | undefined>(
      MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No module restriction on this endpoint
    if (!requiredModule) return true;

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;

    if (!user) return false;

    // SUPER_ADMIN has access to all modules regardless of tenant configuration
    if (user.role === 'SUPER_ADMIN') return true;

    return (user.allowedModules ?? []).includes(requiredModule);
  }
}
