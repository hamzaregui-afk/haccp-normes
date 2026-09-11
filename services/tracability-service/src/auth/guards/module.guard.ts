/**
 * module.guard.ts
 *
 * Guards a route by checking the authenticated user's tenant has the required
 * module enabled (carried in the JWT allowedModules array). Applied via
 * `@RequireModule('HACCP_CONTROLS')` (typically at controller-class level) plus
 * `@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)`.
 *
 * ARCH-DECISION: enforcement is STAGED via the MODULE_ENFORCEMENT env
 * ('off' | 'log' | 'strict', default 'log' — see parseModuleEnforcement in
 * @haccp/shared-types). Tenant module toggles were historically enforced
 * nowhere, so the default 'log' mode ALLOWS the request but warns — wiring this
 * guard changes no behaviour until an operator sets MODULE_ENFORCEMENT=strict.
 * SUPER_ADMIN always bypasses module checks (global scope).
 *
 * The env is read here (not via config/env.ts) so the guard stays a drop-in,
 * dependency-free copy across services — a documented exception mirroring
 * crypto/secret-cipher, and safe because the value only widens/narrows an
 * operational gate and defaults to the non-blocking mode.
 */

import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type JwtPayload, parseModuleEnforcement } from '@haccp/shared-types';

export const MODULE_KEY = 'requiredModule';

@Injectable()
export class ModuleGuard implements CanActivate {
  private readonly logger = new Logger(ModuleGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredModule = this.reflector.getAllAndOverride<string | undefined>(
      MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No module restriction on this endpoint.
    if (!requiredModule) return true;

    const mode = parseModuleEnforcement(process.env['MODULE_ENFORCEMENT']);
    if (mode === 'off') return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: JwtPayload; method?: string; url?: string }>();
    const user = request.user;
    if (!user) return false;

    // SUPER_ADMIN has access to all modules regardless of tenant configuration.
    if (user.role === 'SUPER_ADMIN') return true;
    if ((user.allowedModules ?? []).includes(requiredModule)) return true;

    // Tenant does NOT have the module enabled.
    if (mode === 'strict') {
      throw new ForbiddenException(`Module ${requiredModule} is not enabled for this tenant`);
    }
    this.logger.warn(
      `[module-gate] tenant=${user.tenantId} user=${user.sub} lacks module ${requiredModule} ` +
        `for ${request.method ?? '?'} ${request.url ?? '?'} — ALLOWED (MODULE_ENFORCEMENT=log)`,
    );
    return true;
  }
}
