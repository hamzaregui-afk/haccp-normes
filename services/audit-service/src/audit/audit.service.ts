import { Injectable, NotFoundException } from '@nestjs/common';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAuditLogDto, AuditQuery } from './dto/audit.dto';

// ARCH-DECISION: No update() or delete() methods exist on this service.
// The audit_log table is APPEND-ONLY by legal/regulatory requirement (HACCP).
// Any future developer who adds mutating methods here is introducing a
// compliance violation. The Prisma schema itself has no updatedAt column as a
// structural reminder that records are immutable after creation.

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * APPEND ONLY — create a new immutable log entry.
   * Never call prisma.auditLog.update() or prisma.auditLog.delete().
   */
  async log(dto: CreateAuditLogDto, tenantId: string) {
    const entry = await this.prisma.auditLog.create({
      data: { ...dto, tenantId },
    });
    return toApiResponse(entry, undefined, 'Audit log created');
  }

  async findAll(tenantId: string, query: AuditQuery) {
    const { page, limit, userId, resource, action, from, to } = query;

    const where = {
      tenantId,
      ...(userId   ? { userId }   : {}),
      ...(resource ? { resource } : {}),
      ...(action   ? { action }   : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to   ? { lte: to   } : {}),
            },
          }
        : {}),
    };

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return toApiResponse(logs, toPaginationMeta(total, page, limit));
  }

  async findOne(id: string, tenantId: string) {
    const log = await this.prisma.auditLog.findFirst({
      where: { id, tenantId },
    });
    if (!log) throw new NotFoundException(`AuditLog ${id} not found`);
    return toApiResponse(log);
  }

  // ─── INTENTIONALLY NO update() / delete() ────────────────────────────────
  // If you think you need one: you do not. The audit log is immutable by law.
}
