import { Injectable, NotFoundException } from '@nestjs/common';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateDocRequestDto, UpdateDocRequestDto, DocRequestQuery } from './dto/document-request.dto';

@Injectable()
export class DocumentRequestService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, requesterId: string, isAdmin: boolean, query: DocRequestQuery) {
    const { page, limit, status } = query;
    const where = {
      tenantId,
      // Admins see all requests; regular users only see their own
      ...(isAdmin ? {} : { requesterId }),
      ...(status ? { status: status as never } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.documentRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.documentRequest.count({ where }),
    ]);

    return toApiResponse(items, toPaginationMeta(total, { page, limit }));
  }

  async create(tenantId: string, requesterId: string, dto: CreateDocRequestDto) {
    const req = await this.prisma.documentRequest.create({
      data: {
        tenantId,
        requesterId,
        title:       dto.title,
        description: dto.description,
        category:    (dto.category ?? null) as never,
      },
    });
    return toApiResponse(req, undefined, 'Demande créée');
  }

  async update(id: string, tenantId: string, fulfillerId: string, dto: UpdateDocRequestDto) {
    const existing = await this.prisma.documentRequest.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`Demande ${id} introuvable`);

    // ARCH-DECISION: Double-scoped where for defense-in-depth — tenantId closes
    // the TOCTOU window between the findFirst ownership check above and this update.
    const updated = await this.prisma.documentRequest.update({
      where: { id, tenantId },
      data: {
        status:      dto.status as never,
        fulfillerId,
        ...(dto.documentId ? { documentId: dto.documentId } : {}),
        ...(dto.comment    ? { comment:    dto.comment }    : {}),
      },
    });
    return toApiResponse(updated, undefined, dto.status === 'FULFILLED' ? 'Demande satisfaite' : 'Demande rejetée');
  }
}
