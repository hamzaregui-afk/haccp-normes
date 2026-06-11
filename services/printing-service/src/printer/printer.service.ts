import { Injectable, NotFoundException } from '@nestjs/common';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePrinterDto, UpdatePrinterDto, PrinterQuery } from './dto/printer.dto';

@Injectable()
export class PrinterService {
  constructor(private readonly prisma: PrismaService) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  async findAll(tenantId: string, query: PrinterQuery) {
    const { page, limit, connectionType, isActive } = query;

    const where = {
      tenantId,
      ...(connectionType !== undefined ? { connectionType } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.printer.findMany({
        where,
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { jobs: true } } },
      }),
      this.prisma.printer.count({ where }),
    ]);

    return toApiResponse(items, toPaginationMeta(total, { page, limit }));
  }

  async findOne(id: string, tenantId: string) {
    const printer = await this.prisma.printer.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { jobs: true } } },
    });
    if (!printer) throw new NotFoundException(`Imprimante ${id} introuvable`);
    return toApiResponse(printer);
  }

  async create(dto: CreatePrinterDto, tenantId: string) {
    // ARCH-DECISION: If this printer is marked as default, unset all others first
    // within a transaction to guarantee exactly one default per tenant.
    if (dto.isDefault) {
      await this.prisma.printer.updateMany({
        where: { tenantId, isDefault: true },
        data:  { isDefault: false },
      });
    }

    const printer = await this.prisma.printer.create({
      data: {
        tenantId,
        name:                dto.name,
        model:               dto.model ?? null,
        connectionType:      dto.connectionType,
        ipAddress:           dto.ipAddress ?? null,
        port:                dto.port,
        bluetoothIdentifier: dto.bluetoothIdentifier ?? null,
        isDefault:           dto.isDefault,
        siteId:              dto.siteId ?? null,
        zoneId:              dto.zoneId ?? null,
        // Phase A additive fields (omit when undefined → DB defaults apply)
        ...(dto.brand                 !== undefined ? { brand:                 dto.brand }                 : {}),
        ...(dto.protocol              !== undefined ? { protocol:              dto.protocol }              : {}),
        ...(dto.connection            !== undefined ? { connection:            dto.connection }            : {}),
        ...(dto.defaultMediaProfileId !== undefined ? { defaultMediaProfileId: dto.defaultMediaProfileId } : {}),
      },
    });

    return toApiResponse(printer, undefined, 'Imprimante créée');
  }

  async update(id: string, dto: UpdatePrinterDto, tenantId: string) {
    // Verify ownership before modifying
    await this.findOne(id, tenantId);

    // If promoting this printer to default, demote all others first
    if (dto.isDefault === true) {
      await this.prisma.printer.updateMany({
        where: { tenantId, isDefault: true, NOT: { id } },
        data:  { isDefault: false },
      });
    }

    // ARCH-DECISION: Double-scoped where for defense-in-depth (id + tenantId).
    const printer = await this.prisma.printer.update({
      where: { id, tenantId },
      data: {
        ...(dto.name                !== undefined ? { name:                dto.name }                : {}),
        ...(dto.model               !== undefined ? { model:               dto.model }               : {}),
        ...(dto.connectionType      !== undefined ? { connectionType:      dto.connectionType }      : {}),
        ...(dto.ipAddress           !== undefined ? { ipAddress:           dto.ipAddress }           : {}),
        ...(dto.port                !== undefined ? { port:                dto.port }                : {}),
        ...(dto.bluetoothIdentifier !== undefined ? { bluetoothIdentifier: dto.bluetoothIdentifier } : {}),
        ...(dto.isDefault           !== undefined ? { isDefault:           dto.isDefault }           : {}),
        ...(dto.siteId              !== undefined ? { siteId:              dto.siteId }              : {}),
        ...(dto.zoneId              !== undefined ? { zoneId:              dto.zoneId }              : {}),
        ...(dto.brand                 !== undefined ? { brand:                 dto.brand }                 : {}),
        ...(dto.protocol              !== undefined ? { protocol:              dto.protocol }              : {}),
        ...(dto.connection            !== undefined ? { connection:            dto.connection }            : {}),
        ...(dto.defaultMediaProfileId !== undefined ? { defaultMediaProfileId: dto.defaultMediaProfileId } : {}),
      },
    });

    return toApiResponse(printer, undefined, 'Imprimante mise à jour');
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    // ARCH-DECISION: Double-scoped where for defense-in-depth.
    await this.prisma.printer.delete({ where: { id, tenantId } });
    return toApiResponse(null, undefined, 'Imprimante supprimée');
  }

  /**
   * Promote the given printer to the default for this tenant.
   * All other printers are demoted atomically before promoting.
   */
  async setDefault(id: string, tenantId: string) {
    await this.findOne(id, tenantId);

    await this.prisma.$transaction([
      this.prisma.printer.updateMany({
        where: { tenantId, isDefault: true },
        data:  { isDefault: false },
      }),
      this.prisma.printer.update({
        where: { id, tenantId },
        data:  { isDefault: true },
      }),
    ]);

    return toApiResponse(null, undefined, 'Imprimante par défaut définie');
  }

  /**
   * Retrieve the default printer for a tenant, or null if none is configured.
   * Used internally by PrintJobService to resolve the printer for a job.
   */
  async findDefault(tenantId: string) {
    return this.prisma.printer.findFirst({
      where: { tenantId, isDefault: true, isActive: true },
    });
  }
}
