/**
 * dlc-internal.controller.ts
 *
 * Internal service-to-service endpoint exposing a tenant's DLC (date-limite) summary
 * for report generation (report-service → dlc-service).
 *
 * ARCH-DECISION: Guarded by X-Internal-Secret and NOT forwarded by the api-gateway
 * (excluded from the /api/v1 prefix), mirroring auth-internal / nc-internal /
 * controls-internal. tenantId is supplied by the trusted caller.
 */
import { Controller, ForbiddenException, Get, Headers, Query } from '@nestjs/common';

import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

@Controller('internal/dlc')
export class DlcInternalController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /internal/dlc/summary?tenantId=
   * Exact server-side counts of DLC labels: total, expiring today, expiring within
   * 7 days, and already expired.
   */
  @Get('summary')
  async summary(
    @Headers('x-internal-secret') secret: string | undefined,
    @Query('tenantId') tenantId?: string,
  ) {
    if (secret !== env.INTERNAL_SERVICE_SECRET) {
      throw new ForbiddenException('Invalid internal service secret');
    }
    if (!tenantId) return { data: { total: 0, expiringToday: 0, expiringSoon: 0, expired: 0 } };

    const now = new Date();
    const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const endToday   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const in7Days    = new Date(startToday);
    in7Days.setUTCDate(in7Days.getUTCDate() + 7);

    const [total, expiringToday, expiringSoon, expired] = await Promise.all([
      this.prisma.dlcLabel.count({ where: { tenantId } }),
      this.prisma.dlcLabel.count({ where: { tenantId, expiresAt: { gte: startToday, lte: endToday } } }),
      this.prisma.dlcLabel.count({ where: { tenantId, expiresAt: { gte: startToday, lte: in7Days } } }),
      this.prisma.dlcLabel.count({ where: { tenantId, expiresAt: { lt: startToday } } }),
    ]);

    return { data: { total, expiringToday, expiringSoon, expired } };
  }
}
