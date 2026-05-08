import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEquipmentDto, UpdateEquipmentDto, EquipmentQuery } from './dto/equipment.dto';

@Injectable()
export class EquipmentService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: EquipmentQuery) {
    const { page, limit, search, type, siteId, active } = query;

    const where = {
      tenantId,
      ...(active !== undefined ? { isActive: active === 'true' } : { isActive: true }),
      ...(type   ? { type: { equals: type, mode: 'insensitive' as const } } : {}),
      ...(siteId ? { siteId } : {}),
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { code: { contains: search, mode: 'insensitive' as const } },
          { brand: { contains: search, mode: 'insensitive' as const } },
          { serialNumber: { contains: search, mode: 'insensitive' as const } },
        ],
      } : {}),
    };

    const [equipments, total] = await Promise.all([
      this.prisma.equipment.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.equipment.count({ where }),
    ]);

    return toApiResponse(equipments, toPaginationMeta(total, page, limit));
  }

  async findOne(id: string, tenantId: string) {
    const equipment = await this.prisma.equipment.findFirst({ where: { id, tenantId } });
    if (!equipment) throw new NotFoundException(`Équipement ${id} introuvable`);
    return toApiResponse(equipment);
  }

  async create(dto: CreateEquipmentDto, tenantId: string) {
    const exists = await this.prisma.equipment.findFirst({ where: { code: dto.code, tenantId } });
    if (exists) throw new ConflictException(`Code équipement "${dto.code}" déjà utilisé`);

    const equipment = await this.prisma.equipment.create({ data: { ...dto, tenantId } });
    return toApiResponse(equipment, undefined, 'Équipement créé');
  }

  async update(id: string, dto: UpdateEquipmentDto, tenantId: string) {
    await this.findOne(id, tenantId);
    const equipment = await this.prisma.equipment.update({ where: { id }, data: dto });
    return toApiResponse(equipment);
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.prisma.equipment.update({ where: { id }, data: { isActive: false } });
    return toApiResponse(null, undefined, 'Équipement désactivé');
  }
}
