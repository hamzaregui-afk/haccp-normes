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
        lotNumber:   dto.lotNumber,  // HACCP batch traceability field — nullable
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
    return toApiResponse(labels, toPaginationMeta(total, page, limit));
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

  async getExpiringSoon(tenantId: string, days = 3) {
    const now = new Date();
    const cutoff = addDays(now, days);
    const labels = await this.prisma.dlcLabel.findMany({
      where: {
        tenantId,
        expiresAt: { gte: now, lte: cutoff },
      },
      orderBy: { expiresAt: 'asc' },
    });
    return toApiResponse(labels);
  }
}
