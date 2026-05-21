import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { toApiResponse } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSiteDto, CreateZoneDto, UpdateSiteDto, UpdateZoneDto } from './dto/site.dto';

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
    // ARCH-DECISION: Verify tenant exists BEFORE the INSERT so callers get a
    // clear 400 instead of a Prisma P2003 FK violation that surfaces as 500.
    // This is especially important for SUPER_ADMIN (tenantId='platform') who
    // may not have a corresponding row in the tenants table.
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new BadRequestException(
        `Tenant "${tenantId}" does not exist. SUPER_ADMIN accounts must have a tenant row to manage sites.`,
      );
    }

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

  async update(id: string, dto: UpdateSiteDto, tenantId: string) {
    const site = await this.prisma.site.findFirst({ where: { id, tenantId } });
    if (!site) throw new NotFoundException(`Site ${id} not found`);
    // ARCH-DECISION: Double-scoped where for defense-in-depth.
    const updated = await this.prisma.site.update({ where: { id, tenantId }, data: dto });
    return toApiResponse(updated, undefined, 'Site updated');
  }

  async remove(id: string, tenantId: string) {
    const site = await this.prisma.site.findFirst({ where: { id, tenantId } });
    if (!site) throw new NotFoundException(`Site ${id} not found`);
    // ARCH-DECISION: Double-scoped where for defense-in-depth.
    await this.prisma.site.delete({ where: { id, tenantId } });
    return toApiResponse(null, undefined, 'Site deleted');
  }

  async updateZone(siteId: string, zoneId: string, dto: UpdateZoneDto, tenantId: string) {
    const site = await this.prisma.site.findFirst({ where: { id: siteId, tenantId } });
    if (!site) throw new NotFoundException(`Site ${siteId} not found`);

    const zone = await this.prisma.zone.findFirst({ where: { id: zoneId, siteId } });
    if (!zone) throw new NotFoundException(`Zone ${zoneId} not found`);

    // ARCH-DECISION: Double-scoped with siteId (zones have no tenantId column —
    // tenant isolation is enforced via the parent site ownership check above).
    const updated = await this.prisma.zone.update({ where: { id: zoneId, siteId }, data: dto });
    return toApiResponse(updated, undefined, 'Zone updated');
  }

  async removeZone(siteId: string, zoneId: string, tenantId: string) {
    const site = await this.prisma.site.findFirst({ where: { id: siteId, tenantId } });
    if (!site) throw new NotFoundException(`Site ${siteId} not found`);

    const zone = await this.prisma.zone.findFirst({ where: { id: zoneId, siteId } });
    if (!zone) throw new NotFoundException(`Zone ${zoneId} not found`);

    // ARCH-DECISION: Double-scoped with siteId (same rationale as updateZone above).
    await this.prisma.zone.delete({ where: { id: zoneId, siteId } });
    return toApiResponse(null, undefined, 'Zone deleted');
  }
}
