import { Injectable, NotFoundException } from '@nestjs/common';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateMediaProfileDto,
  UpdateMediaProfileDto,
  MediaProfileQuery,
} from './dto/media-profile.dto';

@Injectable()
export class MediaProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: MediaProfileQuery) {
    const { page, limit, mediaType, isActive } = query;

    const where = {
      tenantId,
      ...(mediaType !== undefined ? { mediaType } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.mediaProfile.findMany({
        where,
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { printers: true } } },
      }),
      this.prisma.mediaProfile.count({ where }),
    ]);

    return toApiResponse(items, toPaginationMeta(total, { page, limit }));
  }

  async findOne(id: string, tenantId: string) {
    const profile = await this.prisma.mediaProfile.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { printers: true } } },
    });
    if (!profile) throw new NotFoundException(`Profil média ${id} introuvable`);
    return toApiResponse(profile);
  }

  async create(dto: CreateMediaProfileDto, tenantId: string) {
    // Exactly one default media profile per tenant.
    if (dto.isDefault) {
      await this.prisma.mediaProfile.updateMany({
        where: { tenantId, isDefault: true },
        data:  { isDefault: false },
      });
    }

    const profile = await this.prisma.mediaProfile.create({
      data: {
        tenantId,
        name:          dto.name,
        widthMm:       dto.widthMm,
        heightMm:      dto.heightMm,
        mediaType:     dto.mediaType,
        gapMm:         dto.gapMm ?? null,
        blackMarkMm:   dto.blackMarkMm ?? null,
        dpi:           dto.dpi,
        speed:         dto.speed ?? null,
        density:       dto.density ?? null,
        autoCalibrate: dto.autoCalibrate,
        isDefault:     dto.isDefault,
      },
    });

    return toApiResponse(profile, undefined, 'Profil média créé');
  }

  async update(id: string, dto: UpdateMediaProfileDto, tenantId: string) {
    await this.findOne(id, tenantId);

    if (dto.isDefault === true) {
      await this.prisma.mediaProfile.updateMany({
        where: { tenantId, isDefault: true, NOT: { id } },
        data:  { isDefault: false },
      });
    }

    // Double-scoped where (id + tenantId) for defense-in-depth.
    const profile = await this.prisma.mediaProfile.update({
      where: { id, tenantId },
      data: {
        ...(dto.name          !== undefined ? { name:          dto.name }          : {}),
        ...(dto.widthMm       !== undefined ? { widthMm:       dto.widthMm }       : {}),
        ...(dto.heightMm      !== undefined ? { heightMm:      dto.heightMm }      : {}),
        ...(dto.mediaType     !== undefined ? { mediaType:     dto.mediaType }     : {}),
        ...(dto.gapMm         !== undefined ? { gapMm:         dto.gapMm }         : {}),
        ...(dto.blackMarkMm   !== undefined ? { blackMarkMm:   dto.blackMarkMm }   : {}),
        ...(dto.dpi           !== undefined ? { dpi:           dto.dpi }           : {}),
        ...(dto.speed         !== undefined ? { speed:         dto.speed }         : {}),
        ...(dto.density       !== undefined ? { density:       dto.density }       : {}),
        ...(dto.autoCalibrate !== undefined ? { autoCalibrate: dto.autoCalibrate } : {}),
        ...(dto.isDefault     !== undefined ? { isDefault:     dto.isDefault }     : {}),
      },
    });

    return toApiResponse(profile, undefined, 'Profil média mis à jour');
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    // Printers referencing this profile have default_media_profile_id set to NULL
    // automatically (FK ON DELETE SET NULL) — no orphan/regression.
    await this.prisma.mediaProfile.delete({ where: { id, tenantId } });
    return toApiResponse(null, undefined, 'Profil média supprimé');
  }

  /** Default media profile for a tenant (used by the rendering engine in Phase B). */
  async findDefault(tenantId: string) {
    return this.prisma.mediaProfile.findFirst({
      where: { tenantId, isDefault: true, isActive: true },
    });
  }
}
