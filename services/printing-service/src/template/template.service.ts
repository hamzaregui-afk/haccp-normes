import { Injectable, NotFoundException } from '@nestjs/common';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTemplateDto, UpdateTemplateDto, TemplateQuery } from './dto/template.dto';

@Injectable()
export class TemplateService {
  constructor(private readonly prisma: PrismaService) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  async findAll(tenantId: string, query: TemplateQuery) {
    const { page, limit, labelType, isActive } = query;

    const where = {
      tenantId,
      ...(labelType !== undefined ? { labelType } : {}),
      ...(isActive  !== undefined ? { isActive }  : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.printerTemplate.findMany({
        where,
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.printerTemplate.count({ where }),
    ]);

    return toApiResponse(items, toPaginationMeta(total, { page, limit }));
  }

  async findOne(id: string, tenantId: string) {
    const template = await this.prisma.printerTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!template) throw new NotFoundException(`Modèle d'étiquette ${id} introuvable`);
    return toApiResponse(template);
  }

  async create(dto: CreateTemplateDto, tenantId: string) {
    // If this template is marked as default, unset all others of the same labelType first.
    // ARCH-DECISION: Default is scoped to labelType so each label category (DLC, NC, …)
    // can have its own default template independently.
    if (dto.isDefault) {
      await this.prisma.printerTemplate.updateMany({
        where: { tenantId, labelType: dto.labelType, isDefault: true },
        data:  { isDefault: false },
      });
    }

    const template = await this.prisma.printerTemplate.create({
      data: {
        tenantId,
        name:        dto.name,
        labelType:   dto.labelType,
        widthMm:     dto.widthMm,
        heightMm:    dto.heightMm,
        zplTemplate: dto.zplTemplate,
        isDefault:   dto.isDefault,
      },
    });

    return toApiResponse(template, undefined, 'Modèle créé');
  }

  async update(id: string, dto: UpdateTemplateDto, tenantId: string) {
    const { data: existing } = await this.findOne(id, tenantId);

    // Demote other defaults if promoting this one
    if (dto.isDefault === true) {
      const labelType = dto.labelType ?? existing.labelType;
      await this.prisma.printerTemplate.updateMany({
        where: { tenantId, labelType, isDefault: true, NOT: { id } },
        data:  { isDefault: false },
      });
    }

    // ARCH-DECISION: Double-scoped where for defense-in-depth.
    const template = await this.prisma.printerTemplate.update({
      where: { id, tenantId },
      data: {
        ...(dto.name        !== undefined ? { name:        dto.name }        : {}),
        ...(dto.labelType   !== undefined ? { labelType:   dto.labelType }   : {}),
        ...(dto.widthMm     !== undefined ? { widthMm:     dto.widthMm }     : {}),
        ...(dto.heightMm    !== undefined ? { heightMm:    dto.heightMm }    : {}),
        ...(dto.zplTemplate !== undefined ? { zplTemplate: dto.zplTemplate } : {}),
        ...(dto.isDefault   !== undefined ? { isDefault:   dto.isDefault }   : {}),
      },
    });

    return toApiResponse(template, undefined, 'Modèle mis à jour');
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    // ARCH-DECISION: Double-scoped where for defense-in-depth.
    await this.prisma.printerTemplate.delete({ where: { id, tenantId } });
    return toApiResponse(null, undefined, 'Modèle supprimé');
  }

  /**
   * Find the default template for a given labelType and tenant.
   * Returns null if no default is configured.
   * Used internally by PrintJobService.
   */
  async findDefaultForType(tenantId: string, labelType: string) {
    return this.prisma.printerTemplate.findFirst({
      where: { tenantId, labelType, isDefault: true, isActive: true },
    });
  }
}
