import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReportStatus } from '@prisma/client';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import {
  type CreateReportDto,
  type UpdateReportDto,
  type ReportQuery,
} from './dto/report.dto';

@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── findAll ─────────────────────────────────────────────────────────────────

  async findAll(tenantId: string, query: ReportQuery) {
    const { page, limit, status, type } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ReportWhereInput = {
      tenantId,
      ...(status ? { status: status as ReportStatus } : {}),
      ...(type   ? { type }                           : {}),
    };

    const [reports, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        orderBy: { generatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.report.count({ where }),
    ]) as [Awaited<ReturnType<typeof this.prisma.report.findMany>>, number];

    return toApiResponse(reports, toPaginationMeta(total, { page, limit }));
  }

  // ─── findOne ─────────────────────────────────────────────────────────────────

  async findOne(id: string, tenantId: string) {
    const report = await this.prisma.report.findFirst({
      where: { id, tenantId },
    });
    if (!report) {
      throw new NotFoundException(`Report ${id} not found`);
    }
    return toApiResponse(report);
  }

  // ─── findOneRaw ───────────────────────────────────────────────────────────────
  // Returns the raw Prisma record (not wrapped in ApiResponse) for use by
  // internal callers such as PDF generation, which need the full domain object.

  async findOneRaw(id: string, tenantId: string) {
    const report = await this.prisma.report.findFirst({
      where: { id, tenantId },
    });
    if (!report) {
      throw new NotFoundException(`Report ${id} not found`);
    }
    return report;
  }

  // ─── create ──────────────────────────────────────────────────────────────────

  async create(dto: CreateReportDto, tenantId: string) {
    const report = await this.prisma.report.create({
      data: {
        type:     dto.type,
        status:   'PENDING',
        tenantId,
      },
    });
    return toApiResponse(report, undefined, 'Report created successfully');
  }

  // ─── update ──────────────────────────────────────────────────────────────────

  async update(
    id: string,
    dto: UpdateReportDto,
    tenantId: string,
    userId: string,
  ) {
    // Verify it belongs to the tenant first
    const existing = await this.prisma.report.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Report ${id} not found`);
    }

    const data: Record<string, unknown> = {};

    if (dto.fileUrl !== undefined) data['fileUrl'] = dto.fileUrl;

    if (dto.status !== undefined) {
      data['status'] = dto.status;

      if (dto.status === 'VALIDATED') {
        data['validatedBy'] = userId;
        data['validatedAt'] = new Date();
      }

      if (dto.status === 'SENT') {
        data['sentAt'] = new Date();
      }
    }

    const updated = await this.prisma.report.update({
      where: { id },
      data,
    });

    return toApiResponse(updated, undefined, 'Report updated successfully');
  }

  // ─── remove ──────────────────────────────────────────────────────────────────

  async remove(id: string, tenantId: string) {
    const report = await this.prisma.report.findFirst({
      where: { id, tenantId },
    });
    if (!report) {
      throw new NotFoundException(`Report ${id} not found`);
    }
    if (report.status !== 'PENDING') {
      throw new BadRequestException(
        `Only PENDING reports can be deleted. Current status: ${report.status}`,
      );
    }
    await this.prisma.report.delete({ where: { id } });
    return toApiResponse(null, undefined, 'Report deleted successfully');
  }

  // ─── getStats ────────────────────────────────────────────────────────────────

  async getStats(tenantId: string) {
    const [total, pending, underReview, validated, sent] =
      await this.prisma.$transaction([
        this.prisma.report.count({ where: { tenantId } }),
        this.prisma.report.count({ where: { tenantId, status: 'PENDING' } }),
        this.prisma.report.count({ where: { tenantId, status: 'UNDER_REVIEW' } }),
        this.prisma.report.count({ where: { tenantId, status: 'VALIDATED' } }),
        this.prisma.report.count({ where: { tenantId, status: 'SENT' } }),
      ]);

    return toApiResponse({ total, pending, underReview, validated, sent });
  }
}
