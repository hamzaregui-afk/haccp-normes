/**
 * tenant-internal.controller.ts
 *
 * Internal service-to-service endpoint for JWT context enrichment.
 *
 * ARCH-DECISION: Called by auth-service during login/refresh so that the JWT
 * can carry allowedModules, subscriptionPlan, and tenantStatus without an extra
 * DB round-trip on every request. Uses X-Internal-Secret header instead of JWT
 * (the user's JWT doesn't exist yet during login).
 *
 * The /internal/** path is excluded from the api/v1 global prefix and is NOT
 * forwarded by nginx — it is only reachable from within the Docker cluster.
 */

import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Logger,
  Param,
} from '@nestjs/common';

import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

// ARCH-DECISION: @SkipThrottle() intentionally omitted — tenant-service does not
// install @nestjs/throttler. The /internal/** path is excluded from nginx routing
// so it is only reachable within the Docker cluster; no rate-limiting needed.
@Controller('internal/tenants')
export class TenantInternalController {
  private readonly logger = new Logger(TenantInternalController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /internal/tenants/:id/jwt-context
   *
   * Returns the data that auth-service needs to enrich the JWT payload:
   *   - allowedModules: list of enabled TenantModuleKey values
   *   - subscriptionPlan: trial | standard | premium | enterprise
   *   - tenantStatus: ACTIVE | SUSPENDED | ARCHIVED
   *
   * Called by auth-service on every login and token refresh.
   * Graceful: returns safe defaults if the tenant isn't found yet.
   */
  @Get(':id/jwt-context')
  async getJwtContext(
    @Param('id') tenantId: string,
    @Headers('x-internal-secret') secret: string | undefined,
  ) {
    if (secret !== env.INTERNAL_SERVICE_SECRET) {
      this.logger.warn(`Unauthorized jwt-context request for tenant ${tenantId}`);
      throw new ForbiddenException('Invalid internal service secret');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        status: true,
        plan:   true,
        modules: {
          where:  { enabled: true },
          select: { moduleKey: true },
        },
      },
    });

    if (!tenant) {
      // Tenant not found — return safe empty defaults.
      // This can happen if auth-service races ahead of tenant-service on first deploy.
      this.logger.warn(`Tenant ${tenantId} not found — returning empty jwt-context`);
      return { allowedModules: [], subscriptionPlan: 'standard', tenantStatus: 'ACTIVE' };
    }

    return {
      allowedModules:   tenant.modules.map((m) => m.moduleKey as string),
      subscriptionPlan: tenant.plan   ?? 'standard',
      tenantStatus:     tenant.status ?? 'ACTIVE',
    };
  }
}
