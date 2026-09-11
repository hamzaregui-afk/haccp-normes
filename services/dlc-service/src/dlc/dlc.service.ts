import { Injectable, NotFoundException } from '@nestjs/common';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type { CalculateDlcDto, PrintLabelDto, DlcQuery } from './dto/dlc.dto';

/** Add N days to a Date without mutating the original. */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function endOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/** Per-tenant DLC counts for the SUPER_ADMIN "Tous les clients" overview. */
export interface TenantDlcStatRow {
  tenantId: string;
  expiringToday: number;
  expiringSoon: number;
  expired: number;
}

@Injectable()
export class DlcService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pure calculation — no DB write. Returns computed expiry date. */
  calculate(dto: CalculateDlcDto) {
    const expiresAt = addDays(dto.producedAt, dto.dlcDays);
    return toApiResponse({
      productId:   dto.productId,
      productName: dto.productName,
      dlcDays:     dto.dlcDays,
      producedAt:  dto.producedAt,
      expiresAt,
    });
  }

  async printLabel(dto: PrintLabelDto, tenantId: string, printedBy: string) {
    const expiresAt = dto.expiresAt ?? addDays(dto.producedAt, dto.dlcDays);
    const label = await this.prisma.dlcLabel.create({
      data: {
        tenantId,
        productId:   dto.productId,
        productName: dto.productName,
        // HACCP batch traceability field — nullable; use spread to satisfy exactOptionalPropertyTypes
        ...(dto.lotNumber !== undefined && { lotNumber: dto.lotNumber }),
        producedAt:  dto.producedAt,
        expiresAt,
        printedBy,
      },
    });
    return toApiResponse(label, undefined, 'Label enregistré');
  }

  async findAll(tenantId: string, query: DlcQuery) {
    const { page, limit, productId, printedBy, from, to } = query;
    const where = {
      tenantId,
      ...(productId ? { productId } : {}),
      ...(printedBy ? { printedBy } : {}),
      ...(from || to
        ? { printedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    };
    const [labels, total] = await Promise.all([
      this.prisma.dlcLabel.findMany({
        where,
        orderBy: { printedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dlcLabel.count({ where }),
    ]);
    return toApiResponse(labels, toPaginationMeta(total, { page, limit }));
  }

  async findOne(id: string, tenantId: string) {
    const label = await this.prisma.dlcLabel.findFirst({ where: { id, tenantId } });
    if (!label) throw new NotFoundException(`DLC label ${id} not found`);
    return toApiResponse(label);
  }

  async getExpiringToday(tenantId: string) {
    const today = new Date();
    const labels = await this.prisma.dlcLabel.findMany({
      where: {
        tenantId,
        expiresAt: { gte: startOfDayUTC(today), lte: endOfDayUTC(today) },
      },
      orderBy: { expiresAt: 'asc' },
    });
    return toApiResponse(labels);
  }

  /**
   * Cross-tenant supervision aggregate ("Tous les clients" / ALL mode).
   * SUPER_ADMIN-only. Groups DLC label counts by tenantId; keys by tenantId,
   * names joined client-side.
   */
  async getStatsByTenant() {
    const now        = new Date();
    const startToday = startOfDayUTC(now);
    const endToday   = endOfDayUTC(now);
    const soonCutoff = endOfDayUTC(addDays(now, 3));

    const [todayGroups, soonGroups, expiredGroups] = await Promise.all([
      this.prisma.dlcLabel.groupBy({
        by: ['tenantId'],
        where: { expiresAt: { gte: startToday, lte: endToday } },
        _count: { _all: true },
      }),
      this.prisma.dlcLabel.groupBy({
        by: ['tenantId'],
        where: { expiresAt: { gte: startToday, lte: soonCutoff } },
        _count: { _all: true },
      }),
      this.prisma.dlcLabel.groupBy({
        by: ['tenantId'],
        where: { expiresAt: { lt: startToday } },
        _count: { _all: true },
      }),
    ]);

    type Row = TenantDlcStatRow;
    const rows = new Map<string, Row>();
    const row = (tenantId: string): Row => {
      let r = rows.get(tenantId);
      if (!r) {
        r = { tenantId, expiringToday: 0, expiringSoon: 0, expired: 0 };
        rows.set(tenantId, r);
      }
      return r;
    };

    for (const g of todayGroups) row(g.tenantId).expiringToday = g._count._all;
    for (const g of soonGroups) row(g.tenantId).expiringSoon = g._count._all;
    for (const g of expiredGroups) row(g.tenantId).expired = g._count._all;

    const byTenant = [...rows.values()];
    const totals = byTenant.reduce(
      (acc, r) => ({
        expiringToday: acc.expiringToday + r.expiringToday,
        expiringSoon:  acc.expiringSoon + r.expiringSoon,
        expired:       acc.expired + r.expired,
      }),
      { expiringToday: 0, expiringSoon: 0, expired: 0 },
    );

    return toApiResponse({ totals, byTenant });
  }

  async getExpiringSoon(tenantId: string, days = 3) {
    const now = new Date();
    const cutoff = addDays(now, days);
    const labels = await this.prisma.dlcLabel.findMany({
      where: {
        tenantId,
        // ARCH-DECISION: use startOfDayUTC so labels that expired earlier today
        // (but not yet physically removed) are still included in "expiring soon".
        expiresAt: { gte: startOfDayUTC(now), lte: endOfDayUTC(cutoff) },
      },
      orderBy: { expiresAt: 'asc' },
    });
    return toApiResponse(labels);
  }
}
