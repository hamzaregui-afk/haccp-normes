import { Injectable, NotFoundException } from '@nestjs/common';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import type { CreateTracabilityDto, UpdateTracabilityDto, TracabilityQuery } from './dto/tracability.dto';

@Injectable()
export class TracabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minio:  MinioService,
  ) {}

  // ── Reference generation ────────────────────────────────────────────────────

  private async generateReference(tenantId: string): Promise<string> {
    const year  = new Date().getFullYear();
    const count = await this.prisma.tracability.count({
      where: { tenantId, reference: { startsWith: `TRAC-${year}-` } },
    });
    const seq = String(count + 1).padStart(4, '0');
    return `TRAC-${year}-${seq}`;
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  async findAll(tenantId: string, query: TracabilityQuery) {
    const { page, limit, search, type, status, from, to } = query;

    const where = {
      tenantId,
      ...(type   ? { type }   : {}),
      ...(status ? { status } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(search ? {
        OR: [
          { reference:   { contains: search, mode: 'insensitive' as const } },
          { productName: { contains: search, mode: 'insensitive' as const } },
          { lotNumber:   { contains: search, mode: 'insensitive' as const } },
        ],
      } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.tracability.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { photos: true } } },
      }),
      this.prisma.tracability.count({ where }),
    ]);

    return toApiResponse(items, toPaginationMeta(total, { page, limit }));
  }

  async findOne(id: string, tenantId: string) {
    const record = await this.prisma.tracability.findFirst({
      where: { id, tenantId },
      include: { photos: { orderBy: { uploadedAt: 'asc' } } },
    });
    if (!record) throw new NotFoundException(`Tracabilité ${id} introuvable`);

    // Refresh presigned URLs for all photos
    const photos = await Promise.all(
      record.photos.map(async (p) => ({ ...p, url: await this.minio.presignedGetUrl(p.objectKey) })),
    );

    return toApiResponse({ ...record, photos });
  }

  async create(dto: CreateTracabilityDto, tenantId: string, createdById: string) {
    const reference = await this.generateReference(tenantId);
    const record = await this.prisma.tracability.create({
      data: {
        tenantId,
        createdById,
        reference,
        type:          dto.type,
        lotNumber:     dto.lotNumber,
        productName:   dto.productName,
        supplierId:    dto.supplierId ?? null,
        siteId:        dto.siteId ?? null,
        quantity:      dto.quantity ?? null,
        unit:          dto.unit ?? null,
        receptionDate: dto.receptionDate ?? null,
        expiryDate:    dto.expiryDate ?? null,
        temperature:   dto.temperature ?? null,
        notes:         dto.notes ?? null,
      },
    });
    return toApiResponse(record, undefined, 'Fiche de traçabilité créée');
  }

  async update(id: string, dto: UpdateTracabilityDto, tenantId: string) {
    await this.findOne(id, tenantId);
    // ARCH-DECISION: Double-scoped where for defense-in-depth.
    const record = await this.prisma.tracability.update({
      where: { id, tenantId },
      data:  {
        ...(dto.status        !== undefined ? { status:        dto.status }         : {}),
        ...(dto.type          !== undefined ? { type:          dto.type }           : {}),
        ...(dto.lotNumber     !== undefined ? { lotNumber:     dto.lotNumber }      : {}),
        ...(dto.productName   !== undefined ? { productName:   dto.productName }    : {}),
        ...(dto.supplierId    !== undefined ? { supplierId:    dto.supplierId }     : {}),
        ...(dto.siteId        !== undefined ? { siteId:        dto.siteId }        : {}),
        ...(dto.quantity      !== undefined ? { quantity:      dto.quantity }       : {}),
        ...(dto.unit          !== undefined ? { unit:          dto.unit }          : {}),
        ...(dto.receptionDate !== undefined ? { receptionDate: dto.receptionDate } : {}),
        ...(dto.expiryDate    !== undefined ? { expiryDate:    dto.expiryDate }    : {}),
        ...(dto.temperature   !== undefined ? { temperature:   dto.temperature }   : {}),
        ...(dto.notes         !== undefined ? { notes:         dto.notes }         : {}),
      },
    });
    return toApiResponse(record, undefined, 'Fiche mise à jour');
  }

  async remove(id: string, tenantId: string) {
    const { data: record } = await this.findOne(id, tenantId);

    // Delete all photos from MinIO (cascade on DB handles tracability_photos rows)
    if (record.photos?.length) {
      await Promise.allSettled(
        record.photos.map((p: { objectKey: string }) => this.minio.deleteObject(p.objectKey)),
      );
    }

    // ARCH-DECISION: Double-scoped where for defense-in-depth.
    await this.prisma.tracability.delete({ where: { id, tenantId } });
    return toApiResponse(null, undefined, 'Fiche de traçabilité supprimée');
  }

  // ── Photo management ─────────────────────────────────────────────────────────

  async addPhoto(
    id: string,
    tenantId: string,
    file: Express.Multer.File,
    caption?: string,
  ) {
    // Verify the tracability belongs to this tenant before writing
    await this.findOne(id, tenantId);

    const objectKey = await this.minio.upload(file.buffer, file.originalname, file.mimetype, tenantId, id);
    const url       = await this.minio.presignedGetUrl(objectKey);

    const photo = await this.prisma.tracabilityPhoto.create({
      data: { tracabilityId: id, objectKey, url, caption: caption ?? null },
    });

    return toApiResponse({ ...photo, url }, undefined, 'Photo ajoutée');
  }

  async removePhoto(tracabilityId: string, photoId: string, tenantId: string) {
    // Verify ownership through parent record (tenantId scoping)
    await this.findOne(tracabilityId, tenantId);

    const photo = await this.prisma.tracabilityPhoto.findFirst({
      where: { id: photoId, tracabilityId },
    });
    if (!photo) throw new NotFoundException(`Photo ${photoId} introuvable`);

    await this.minio.deleteObject(photo.objectKey);
    await this.prisma.tracabilityPhoto.delete({ where: { id: photoId } });

    return toApiResponse(null, undefined, 'Photo supprimée');
  }

  // ── Stats ────────────────────────────────────────────────────────────────────

  async getStats(tenantId: string) {
    const [total, inProgress, completed, cancelled, totalPhotos] = await Promise.all([
      this.prisma.tracability.count({ where: { tenantId } }),
      this.prisma.tracability.count({ where: { tenantId, status: 'IN_PROGRESS' } }),
      this.prisma.tracability.count({ where: { tenantId, status: 'COMPLETED' } }),
      this.prisma.tracability.count({ where: { tenantId, status: 'CANCELLED' } }),
      this.prisma.tracabilityPhoto.count({ where: { tracability: { tenantId } } }),
    ]);

    return toApiResponse({ total, inProgress, completed, cancelled, totalPhotos });
  }
}
