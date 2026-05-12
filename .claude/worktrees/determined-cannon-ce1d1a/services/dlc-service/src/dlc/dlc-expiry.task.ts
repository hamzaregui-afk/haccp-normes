import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { publishDomainEvent } from '@haccp/shared-utils';
import { PrismaService } from '../prisma/prisma.service';

/**
 * DlcExpiryTask — daily cron-like background task.
 *
 * ARCH-DECISION: We avoid @nestjs/schedule (an extra dependency) by using
 * a self-scheduling setTimeout loop that fires once per day at 07:00 UTC.
 * This is robust enough for a single-instance deployment and removes the
 * overhead of the NestJS scheduler module. If the service scales horizontally
 * (multiple replicas), a distributed lock (Redis SET NX) would be needed —
 * that's deferred until the need arises.
 *
 * Flow:
 *   1. onModuleInit → compute ms until next 07:00 UTC → setTimeout
 *   2. When the timer fires → run checkAndNotify() → setTimeout again (24h)
 *   3. checkAndNotify() queries ALL DLC labels expiring today (across tenants)
 *      and publishes one `dlc.labels.expiring-today` event per tenant so that
 *      notification-service can dispatch emails/push notifications.
 */
@Injectable()
export class DlcExpiryTask implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DlcExpiryTask.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.scheduleNext();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  // ── Scheduling ─────────────────────────────────────────────────────────────

  private scheduleNext() {
    const msUntilNextCheck = this.msUntilHour(7); // 07:00 UTC
    this.logger.log(`DLC expiry check scheduled in ${Math.round(msUntilNextCheck / 60_000)} min`);
    this.timer = setTimeout(() => void this.tick(), msUntilNextCheck);
  }

  private async tick() {
    await this.checkAndNotify();
    // Re-schedule exactly 24 h later to avoid drift
    this.timer = setTimeout(() => void this.tick(), 24 * 60 * 60 * 1000);
  }

  /** Milliseconds until the next occurrence of `hour:00:00 UTC`. */
  private msUntilHour(hour: number): number {
    const now  = new Date();
    const next = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hour, 0, 0, 0,
    ));
    // If 07:00 UTC already passed today, schedule for tomorrow
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next.getTime() - now.getTime();
  }

  // ── Core logic ─────────────────────────────────────────────────────────────

  /**
   * Queries labels expiring today across ALL tenants (admin-level query — no
   * tenant_id filter because we need to notify every tenant simultaneously).
   * Groups results by tenantId and fires one domain event per tenant.
   */
  async checkAndNotify(): Promise<void> {
    try {
      const todayStart = this.startOfDayUTC(new Date());
      const todayEnd   = this.endOfDayUTC(new Date());

      const labels = await this.prisma.dlcLabel.findMany({
        where: { expiresAt: { gte: todayStart, lte: todayEnd } },
        select: {
          id:          true,
          tenantId:    true,
          productName: true,
          lotNumber:   true,
          expiresAt:   true,
        },
      });

      if (labels.length === 0) {
        this.logger.log('DLC expiry check: no labels expiring today');
        return;
      }

      // Group by tenant
      const byTenant = new Map<string, typeof labels>();
      for (const label of labels) {
        const existing = byTenant.get(label.tenantId) ?? [];
        existing.push(label);
        byTenant.set(label.tenantId, existing);
      }

      // Publish one event per tenant
      const publishJobs = [...byTenant.entries()].map(([tenantId, tenantLabels]) =>
        publishDomainEvent({
          eventType: 'dlc.labels.expiring-today',
          tenantId,
          payload: {
            count:  tenantLabels.length,
            labels: tenantLabels.map((l) => ({
              id:          l.id,
              productName: l.productName,
              lotNumber:   l.lotNumber ?? null,
              expiresAt:   l.expiresAt,
            })),
          },
        }).catch((err: unknown) =>
          this.logger.error(`Failed to publish DLC event for tenant ${tenantId}`, err),
        ),
      );

      await Promise.all(publishJobs);
      this.logger.log(
        `DLC expiry check: published events for ${byTenant.size} tenant(s), ${labels.length} label(s)`,
      );
    } catch (err: unknown) {
      this.logger.error('DLC expiry check failed', err);
    }
  }

  private startOfDayUTC(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private endOfDayUTC(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
  }
}
