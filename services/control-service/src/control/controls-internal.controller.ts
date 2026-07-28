/**
 * controls-internal.controller.ts
 *
 * Internal service-to-service endpoint exposing a tenant's control-execution
 * summary for report generation (report-service → control-service).
 *
 * ARCH-DECISION: Guarded by X-Internal-Secret and NOT forwarded by the api-gateway
 * (excluded from the /api/v1 prefix), mirroring auth-internal / nc-internal. tenantId
 * is supplied by the trusted caller (report-service passes the report's own tenantId).
 */
import { Controller, ForbiddenException, Get, Headers, Query } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';

import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

@Controller('internal/controls')
export class ControlsInternalController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /internal/controls/summary?tenantId=&from=&to=
   * Server-side aggregated counts (exact — no client-side truncation) for a report.
   */
  @Get('summary')
  async summary(
    @Headers('x-internal-secret') secret: string | undefined,
    @Query('tenantId') tenantId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (secret !== env.INTERNAL_SERVICE_SECRET) {
      throw new ForbiddenException('Invalid internal service secret');
    }
    if (!tenantId) return { data: { total: 0, completed: 0, overdue: 0 } };

    const range =
      from || to
        ? { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) }
        : undefined;
    const base = { tenantId, ...(range ? { scheduledAt: range } : {}) };

    const [total, completed, overdue] = await Promise.all([
      this.prisma.controlTask.count({ where: base }),
      this.prisma.controlTask.count({ where: { ...base, status: TaskStatus.COMPLETED } }),
      this.prisma.controlTask.count({ where: { ...base, status: TaskStatus.OVERDUE } }),
    ]);

    return { data: { total, completed, overdue } };
  }
}
