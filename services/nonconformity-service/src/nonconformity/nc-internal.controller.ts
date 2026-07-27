/**
 * nc-internal.controller.ts
 *
 * Internal service-to-service endpoint exposing a tenant's non-conformities for
 * report generation (report-service → nonconformity-service).
 *
 * ARCH-DECISION: Guarded by X-Internal-Secret and NOT forwarded by the api-gateway
 * (excluded from the /api/v1 prefix), mirroring auth-internal. tenantId is supplied
 * by the trusted caller (report-service passes the report's own tenantId), never by
 * an end user — this endpoint is unreachable from outside the Docker network.
 */
import { Controller, ForbiddenException, Get, Headers, Query } from '@nestjs/common';

import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

@Controller('internal/nonconformities')
export class NcInternalController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /internal/nonconformities?tenantId=&from=&to=
   * Returns the tenant's NCs (most recent first, capped) for embedding in a report.
   */
  @Get()
  async list(
    @Headers('x-internal-secret') secret: string | undefined,
    @Query('tenantId') tenantId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (secret !== env.INTERNAL_SERVICE_SECRET) {
      throw new ForbiddenException('Invalid internal service secret');
    }
    if (!tenantId) return { data: [] };

    const createdAt =
      from || to
        ? {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          }
        : undefined;

    const rows = await this.prisma.nonConformity.findMany({
      where: { tenantId, ...(createdAt ? { createdAt } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 5000, // hard cap — reports summarise, they don't dump unbounded data
      select: {
        reference:   true,
        status:      true,
        severity:    true,
        category:    true,
        description: true,
        createdAt:   true,
      },
    });

    return { data: rows };
  }
}
