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
    this.logger.log(
      `[NC create] tenantId=${tenantId} reporter=${reporterId} siteId=${dto.siteId} severity=${dto.severity}`,
    );

    // ARCH-DECISION: reference generation + insert run in a single SERIALIZABLE
    // transaction so concurrent requests cannot receive the same per-tenant
    // NC-YYYY-NNNN sequence number.
    //
    // Reference uniqueness: @@unique([reference, tenantId]) — the same reference
    // can exist in different tenants (each tenant has their own NC-0001).
    // The old global @unique caused P2002 when a second tenant tried to create
    // its first NC (both got NC-YYYY-0001, but the index only allowed one globally).
    const nc = await this.prisma.$transaction(async (tx) => {
      const reference = await this.generateReference(tx, tenantId);
      this.logger.debug(`[NC create] generated reference=${reference} for tenant=${tenantId}`);

      return tx.nonConformity.create({
        data: {
          reference,
          tenantId,
          siteId:           dto.siteId,
          productId:        dto.productId ?? null,
          reporterId,
          description:      dto.description,
          correctiveAction: dto.correctiveAction ?? null,
          severity:         dto.severity ?? NCSeverity.MEDIUM,
          category:         dto.category ?? NCCategory.OTHER,
          status:           NCStatus.OPEN,
        },
        include: { photos: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    this.logger.log(`[NC create] ✅ created ${nc.reference} (id=${nc.id}) for tenant=${tenantId}`);
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

    // ARCH-DECISION: Double-scoped where for defense-in-depth — existing check
    // already validates tenantId ownership, but re-including it in the UPDATE
    // ensures the mutation cannot affect a row in another tenant.
    const updated = await this.prisma.nonConformity.update({
      where: { id, tenantId },
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
    // ARCH-DECISION: Double-scoped where for defense-in-depth.
    await this.prisma.nonConformity.delete({ where: { id, tenantId } });

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
      data: { nonConformityId: id, objectKey, url },
    });

    return toApiResponse(photo, undefined, 'Photo uploaded successfully');
  }

  // ── Auto-create from task event ───────────────────────────────────────────

  /**
   * Creates a NonConformity automatically when a control task completes with
   * overallCompliant: false. Called by TaskCompletedConsumer (RabbitMQ).
   *
   * ARCH-DECISION: Idempotency — Prisma P2002 on @@unique([sourceTaskId, tenantId])
   * is caught and swallowed. If RabbitMQ redelivers the same event the NC already
   * exists and we skip creation silently, preserving exactly-once semantics.
   *
   * ARCH-DECISION: reporterId defaults to assigneeId when available (the operator
   * who ran the control is the de-facto reporter), or 'system' when the task had
   * no individual assignee (group-assigned or unassigned tasks).
   */
  async createFromTaskEvent(args: {
    tenantId:   string;
    taskId:     string;
    zoneId:     string;
    assigneeId: string | null;
    ncComment:  string | null;
    eventId:    string;
  }): Promise<void> {
    const { tenantId, taskId, zoneId, assigneeId, ncComment } = args;

    this.logger.log(
      `[NC auto-create] tenantId=${tenantId} taskId=${taskId} zoneId=${zoneId} reporter=${assigneeId ?? 'system'}`,
    );

    try {
      const nc = await this.prisma.$transaction(async (tx) => {
        const reference = await this.generateReference(tx, tenantId);
        this.logger.debug(
          `[NC auto-create] generated reference=${reference} for tenant=${tenantId}`,
        );

        return tx.nonConformity.create({
          data: {
            reference,
            tenantId,
            siteId:           zoneId,
            reporterId:       assigneeId ?? 'system',
            description:      ncComment ?? 'Contrôle non conforme — créé automatiquement',
            correctiveAction: null,
            severity:         NCSeverity.MEDIUM,
            category:         NCCategory.OTHER,
            status:           NCStatus.OPEN,
            sourceTaskId:     taskId,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      this.logger.log(
        `[NC auto-create] ✅ created ${nc.reference} (id=${nc.id}) for task=${taskId}`,
      );
    } catch (err: unknown) {
      // P2002 = unique constraint violation → NC already exists (idempotency)
      if (
        err instanceof Error &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        this.logger.debug(
          `[NC auto-create] duplicate event for taskId=${taskId} — skipping`,
        );
        return;
      }
      throw err;
    }
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
