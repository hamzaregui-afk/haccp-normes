import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { toApiResponse } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSiteDto, CreateZoneDto } from './dto/site.dto';

@Injectable()
export class SiteService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByTenant(tenantId: string) {
    const sites = await this.prisma.site.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: { zones: true, _count: { select: { zones: true } } },
    });
    return toApiResponse(sites);
  }

  async create(dto: CreateSiteDto, tenantId: string) {
    const exists = await this.prisma.site.findFirst({ where: { name: dto.name, tenantId } });
    if (exists) throw new ConflictException(`Site "${dto.name}" already exists`);

    const site = await this.prisma.site.create({ data: { ...dto, tenantId } });
    return toApiResponse(site, undefined, 'Site created');
  }

  async createZone(siteId: string, dto: CreateZoneDto, tenantId: string) {
    const site = await this.prisma.site.findFirst({ where: { id: siteId, tenantId } });
    if (!site) throw new NotFoundException(`Site ${siteId} not found`);

    const exists = await this.prisma.zone.findFirst({ where: { name: dto.name, siteId } });
    if (exists) throw new ConflictException(`Zone "${dto.name}" already exists in this site`);

    const zone = await this.prisma.zone.create({ data: { name: dto.name, siteId } });
    return toApiResponse(zone, undefined, 'Zone created');
  }

  async remove(id: string, tenantId: string) {
    const site = await this.prisma.site.findFirst({ where: { id, tenantId } });
    if (!site) throw new NotFoundException(`Site ${id} not found`);
    await this.prisma.site.delete({ where: { id } });
    return toApiResponse(null, undefined, 'Site deleted');
  }
}
