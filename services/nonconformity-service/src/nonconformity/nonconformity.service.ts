import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NCCategory, NCSeverity, NCStatus, Prisma } from '@prisma/client';
import { toPaginationMeta, toApiResponse } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { type CreateNcDto, type NcQuery, type UpdateNcDto } from './dto/nonconformity.dto';

// ─── Types ────────────────────────────────────────────────────────────────────

type NcWithPhotos = Prisma.NonConformityGetPayload<{ include: { photos: true } }>;

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class NonconformityService {
  private readonly logger = new Logger(NonconformityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
  ) {}

  // ── List (paginated) ──────────────────────────────────────────────────────

  async findAll(tenantId: string, query: NcQuery) {
    const { page, limit, status, severity, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.NonConformityWhereInput = {
      tenantId,
      ...(status   ? { status }   : {}),
      ...(severity ? { severity } : {}),
      ...(search
        ? {
            OR: [
              { description: { contains: search, mode: 'insensitive' } },
              { reference:   { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.nonConformity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { photos: true },
      }),
      this.prisma.nonConformity.count({ where }),
    ]) as [NcWithPhotos[], number];

    return toApiResponse(items, toPaginationMeta(total, { page, limit }));
  }

  // ── Single ────────────────────────────────────────────────────────────────

  async findOne(id: string, tenantId: string) {
    const nc = await this.prisma.nonConformity.findFirst({
      where: { id, tenantId },
      include: { photos: true },
    });
    if (!nc) {
      throw new NotFoundException(`NonConformity ${id} not found`);
    }
    return toApiResponse(nc as NcWithPhotos);
  }

  // ── Create ────────────────────────────────────────────────────────────────

  async create(dto: CreateNcDto, tenantId: string, reporterId: string) {
    // ARCH-DECISION: reference generation + insert run in a single SERIALIZABLE transaction
    // so that concurrent requests cannot receive the same NC-YYYY-NNNN sequence number.
    const nc = await this.prisma.$transaction(async (tx) => {
      const reference = await this.generateReference(tx, tenantId);
      return tx.nonConformity.create({
        data: {
          reference,
          tenantId,
          siteId:           dto.siteId,
          productId:        dto.productId,
          reporterId,
          description:      dto.description,
          correctiveAction: dto.correctiveAction,
          severity:         dto.severity ?? NCSeverity.MEDIUM,
          category:         dto.category ?? NCCategory.OTHER,
          status:           NCStatus.OPEN,
        },
        include: { photos: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    this.logger.log(`Created NonConformity ${nc.reference} for tenant ${tenantId}`);
    return toApiResponse(nc as NcWithPhotos, undefined, 'Non-conformity created successfully');
  }

  // ── Update ────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateNcDto, tenantId: string, actorId: string) {
    // Verify ownership before mutating
    const existing = await this.prisma.nonConformity.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`NonConformity ${id} not found`);
    }

    // ARCH-DECISION: closedAt + closedById are set server-side when status transitions to CLOSED
    // to guarantee timestamp accuracy and prevent client-supplied manipulation.
    const closedAt =
      dto.status === NCStatus.CLOSED && existing.status !== NCStatus.CLOSED
        ? new Date()
        : undefined;

    const updated = await this.prisma.nonConformity.update({
      where: { id },
      data: {
        ...(dto.status           !== undefined ? { status:           dto.status }           : {}),
        ...(dto.correctiveAction !== undefined ? { correctiveAction: dto.correctiveAction } : {}),
        ...(dto.severity         !== undefined ? { severity:         dto.severity }         : {}),
        ...(dto.category         !== undefined ? { category:         dto.category }         : {}),
        // closedAt and closedById are always set together — never from client body
        ...(closedAt             !== undefined ? { closedAt, closedById: actorId }          : {}),
      },
      include: { photos: true },
    });

    return toApiResponse(updated as NcWithPhotos, undefined, 'Non-conformity updated successfully');
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async remove(id: string, tenantId: string) {
    const nc = await this.prisma.nonConformity.findFirst({
      where: { id, tenantId },
    });
    if (!nc) {
      throw new NotFoundException(`NonConformity ${id} not found`);
    }

    // Only OPEN or REJECTED NCs may be deleted — IN_PROGRESS/CLOSED are locked
    if (nc.status !== NCStatus.OPEN && nc.status !== NCStatus.REJECTED) {
      throw new BadRequestException(
        `Cannot delete a non-conformity with status ${nc.status}. Only OPEN or REJECTED records can be removed.`,
      );
    }

    // NCPhoto rows cascade via Prisma relation — hard delete
    await this.prisma.nonConformity.delete({ where: { id } });

    return toApiResponse(null, undefined, 'Non-conformity deleted successfully');
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  async getStats(tenantId: string) {
    const [total, open, inProgress, closed, rejected, critical] = await Promise.all([
      this.prisma.nonConformity.count({ where: { tenantId } }),
      this.prisma.nonConformity.count({ where: { tenantId, status: NCStatus.OPEN } }),
      this.prisma.nonConformity.count({ where: { tenantId, status: NCStatus.IN_PROGRESS } }),
      this.prisma.nonConformity.count({ where: { tenantId, status: NCStatus.CLOSED } }),
      this.prisma.nonConformity.count({ where: { tenantId, status: NCStatus.REJECTED } }),
      // ARCH-DECISION: "critical" = open/in-progress NCs with CRITICAL severity
      // Used in dashboard KPI to flag immediate food-safety risks.
      this.prisma.nonConformity.count({
        where: {
          tenantId,
          severity: NCSeverity.CRITICAL,
          status: { in: [NCStatus.OPEN, NCStatus.IN_PROGRESS] },
        },
      }),
    ]);

    return toApiResponse({ total, open, inProgress, closed, rejected, critical });
  }

  // ── Photo upload ─────────────────────────────────────────────────────────

  async addPhoto(
    id: string,
    tenantId: string,
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file provided');

    const nc = await this.prisma.nonConformity.findFirst({ where: { id, tenantId } });
    if (!nc) throw new NotFoundException(`NonConformity ${id} not found`);

    const objectKey = await this.minio.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
      tenantId,
      id,
    );

    // Generate an initial presigned URL; clients can regenerate as needed
    const url = await this.minio.presignedGetUrl(objectKey);

    const photo = await this.prisma.nCPhoto.create({
      data: { nonConformityId: id, url },
    });

    return toApiResponse(photo, undefined, 'Photo uploaded successfully');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Generates a unique reference in NC-YYYY-NNNN format.
   * Must be called inside a SERIALIZABLE transaction (see create()) so that the
   * count and the subsequent insert are atomic — prevents duplicate references
   * under concurrent load.
   */
  private async generateReference(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);

    const count = await tx.nonConformity.count({
      where: { tenantId, createdAt: { gte: startOfYear } },
    });

    const seq = String(count + 1).padStart(4, '0');
    return `NC-${year}-${seq}`;
  }
}
