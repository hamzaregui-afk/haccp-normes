import { Injectable, NotFoundException } from '@nestjs/common';
import { toApiResponse } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSubscriptionDto, UpdateSubscriptionDto } from './subscription.dto';

@Injectable()
export class SubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  async getSubscription(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);

    const sub = await this.prisma.tenantSubscription.findUnique({ where: { tenantId } });
    return toApiResponse(sub ?? null);
  }

  async upsertSubscription(tenantId: string, dto: CreateSubscriptionDto | UpdateSubscriptionDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);

    const data = {
      plan:        dto.plan,
      status:      dto.status,
      trialEndsAt: dto.trialEndsAt ? new Date(dto.trialEndsAt) : undefined,
      expiresAt:   dto.expiresAt   ? new Date(dto.expiresAt)   : undefined,
      maxUsers:    dto.maxUsers,
      maxSites:    dto.maxSites,
      notes:       dto.notes,
    };

    // Remove undefined values so partial PATCH doesn't overwrite with null
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined),
    );

    const sub = await this.prisma.tenantSubscription.upsert({
      where:  { tenantId },
      update: cleanData,
      create: { tenantId, ...cleanData },
    });

    // Sync plan field to tenant record for easy access
    if (dto.plan) {
      await this.prisma.tenant.update({ where: { id: tenantId }, data: { plan: dto.plan } });
    }

    return toApiResponse(sub, undefined, 'Abonnement mis à jour');
  }

  // ── Initialize subscription for a new tenant ──────────────────────────────────
  async initForPlan(tenantId: string, plan: string) {
    const trialEndsAt =
      plan === 'trial'
        ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days
        : undefined;

    const statusMap: Record<string, 'TRIAL' | 'ACTIVE'> = {
      trial:    'TRIAL',
      standard: 'ACTIVE',
      premium:  'ACTIVE',
    };

    const limitsMap: Record<string, { maxUsers: number; maxSites: number }> = {
      trial:    { maxUsers: 5,   maxSites: 1  },
      standard: { maxUsers: 50,  maxSites: 10 },
      premium:  { maxUsers: 500, maxSites: 100 },
    };

    const limits = limitsMap[plan] ?? limitsMap.standard;

    await this.prisma.tenantSubscription.upsert({
      where:  { tenantId },
      update: {},
      create: {
        tenantId,
        plan,
        status:      statusMap[plan] ?? 'ACTIVE',
        trialEndsAt: trialEndsAt ?? null,
        maxUsers:    limits.maxUsers,
        maxSites:    limits.maxSites,
      },
    });
  }
}
