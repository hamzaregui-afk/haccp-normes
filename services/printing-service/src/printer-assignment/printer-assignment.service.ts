import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreatePrinterAssignmentDto,
  UpdatePrinterAssignmentDto,
  PrinterAssignmentQuery,
  ResolvePrinterQuery,
} from './dto/printer-assignment.dto';

// More specific contexts win when several assignment rules match a print request.
const SCOPE_RANK: Record<string, number> = { ZONE: 4, SITE: 3, USER: 2, MODULE: 1 };

@Injectable()
export class PrinterAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: PrinterAssignmentQuery) {
    const { page, limit, scope, referenceId, printerId } = query;

    const where = {
      tenantId,
      ...(scope       !== undefined ? { scope }       : {}),
      ...(referenceId !== undefined ? { referenceId } : {}),
      ...(printerId   !== undefined ? { printerId }   : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.printerAssignment.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { printer: { select: { id: true, name: true, isActive: true } } },
      }),
      this.prisma.printerAssignment.count({ where }),
    ]);

    return toApiResponse(items, toPaginationMeta(total, { page, limit }));
  }

  async findOne(id: string, tenantId: string) {
    const assignment = await this.prisma.printerAssignment.findFirst({
      where: { id, tenantId },
      include: { printer: { select: { id: true, name: true, isActive: true } } },
    });
    if (!assignment) throw new NotFoundException(`Affectation ${id} introuvable`);
    return toApiResponse(assignment);
  }

  async create(dto: CreatePrinterAssignmentDto, tenantId: string) {
    // The printer must belong to the same tenant (defense-in-depth + no leak).
    const printer = await this.prisma.printer.findFirst({
      where: { id: dto.printerId, tenantId },
      select: { id: true },
    });
    if (!printer) throw new NotFoundException(`Imprimante ${dto.printerId} introuvable`);

    try {
      const assignment = await this.prisma.printerAssignment.create({
        data: {
          tenantId,
          printerId:   dto.printerId,
          scope:       dto.scope,
          referenceId: dto.referenceId,
          priority:    dto.priority,
        },
      });
      return toApiResponse(assignment, undefined, 'Affectation créée');
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Cette affectation existe déjà pour cette imprimante');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdatePrinterAssignmentDto, tenantId: string) {
    await this.findOne(id, tenantId);

    // If the printer is being changed, it must also belong to the tenant.
    if (dto.printerId !== undefined) {
      const printer = await this.prisma.printer.findFirst({
        where: { id: dto.printerId, tenantId },
        select: { id: true },
      });
      if (!printer) throw new NotFoundException(`Imprimante ${dto.printerId} introuvable`);
    }

    const assignment = await this.prisma.printerAssignment.update({
      where: { id, tenantId },
      data: {
        ...(dto.printerId   !== undefined ? { printerId:   dto.printerId }   : {}),
        ...(dto.scope       !== undefined ? { scope:       dto.scope }       : {}),
        ...(dto.referenceId !== undefined ? { referenceId: dto.referenceId } : {}),
        ...(dto.priority    !== undefined ? { priority:    dto.priority }    : {}),
      },
    });
    return toApiResponse(assignment, undefined, 'Affectation mise à jour');
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.prisma.printerAssignment.delete({ where: { id, tenantId } });
    return toApiResponse(null, undefined, 'Affectation supprimée');
  }

  /**
   * Resolve the printer to use for a given context (Niveau 4). Matches the most
   * specific active assignment (ZONE > SITE > USER > MODULE), breaking ties by
   * priority. Falls back to the tenant's default printer when no rule matches.
   * The DLC/Tracability/Reception modules call this so they never hardcode a printer.
   */
  async resolve(tenantId: string, q: ResolvePrinterQuery) {
    const conds: Array<{ scope: 'ZONE' | 'SITE' | 'USER' | 'MODULE'; referenceId: string }> = [];
    if (q.zoneId) conds.push({ scope: 'ZONE', referenceId: q.zoneId });
    if (q.siteId) conds.push({ scope: 'SITE', referenceId: q.siteId });
    if (q.userId) conds.push({ scope: 'USER', referenceId: q.userId });
    if (q.module) conds.push({ scope: 'MODULE', referenceId: q.module });

    let printer = null;

    if (conds.length > 0) {
      const assignments = await this.prisma.printerAssignment.findMany({
        where: { tenantId, OR: conds, printer: { isActive: true } },
        include: { printer: true },
      });
      if (assignments.length > 0) {
        assignments.sort(
          (a, b) =>
            (SCOPE_RANK[b.scope] - SCOPE_RANK[a.scope]) || (b.priority - a.priority),
        );
        printer = assignments[0].printer;
      }
    }

    if (!printer) {
      printer = await this.prisma.printer.findFirst({
        where: { tenantId, isDefault: true, isActive: true },
      });
    }

    return toApiResponse(printer);
  }
}
