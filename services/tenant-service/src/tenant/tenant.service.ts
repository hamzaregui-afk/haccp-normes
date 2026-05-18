import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantModuleService } from '../tenant-module/tenant-module.service';
import { SubscriptionService } from '../subscription/subscription.service';
import type { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';

@Injectable()
export class TenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleService: TenantModuleService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async findAll(page = 1, limit = 20, search?: string) {
    const where = search
      ? { OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { slug: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ] }
      : {};

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count:       { select: { sites: true, modules: true } },
          subscription: { select: { plan: true, status: true, trialEndsAt: true, maxUsers: true } },
          modules:      { where: { enabled: true }, select: { moduleKey: true } },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return toApiResponse(tenants, toPaginationMeta(total, { page, limit }));
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        sites:        { include: { zones: true }, orderBy: { createdAt: 'asc' } },
        modules:      { orderBy: { moduleKey: 'asc' } },
        subscription: true,
        _count:       { select: { sites: true, modules: true } },
      },
    });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return toApiResponse(tenant);
  }

  async create(dto: CreateTenantDto) {
    const exists = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } });
    if (exists) throw new ConflictException(`Slug "${dto.slug}" already taken`);

    const tenant = await this.prisma.tenant.create({
      data: {
        name:  dto.name,
        slug:  dto.slug,
        plan:  dto.plan,
        email: dto.email,
        phone: dto.phone,
      },
    });

    // ARCH-DECISION: Initialize modules and subscription immediately after tenant
    // creation so the tenant always has a complete configuration. These are
    // upsert operations — idempotent if called again.
    await Promise.all([
      this.moduleService.initForPlan(tenant.id, dto.plan),
      this.subscriptionService.initForPlan(tenant.id, dto.plan),
    ]);

    return toApiResponse(tenant, undefined, 'Client créé avec succès');
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.findOne(id);
    const tenant = await this.prisma.tenant.update({ where: { id }, data: dto });
    return toApiResponse(tenant);
  }

  async remove(id: string) {
    await this.findOne(id);
    const tenant = await this.prisma.tenant.update({
      where: { id },
      data:  { status: 'ARCHIVED' },
    });
    return toApiResponse(tenant, undefined, 'Client archivé');
  }

  // ── Sites for a specific tenant (SUPER_ADMIN cross-tenant view) ───────────────
  async findSitesForTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);

    const sites = await this.prisma.site.findMany({
      where:   { tenantId },
      include: { zones: true },
      orderBy: { createdAt: 'asc' },
    });

    return toApiResponse(sites);
  }

  // ── Create a site for a specific tenant (SUPER_ADMIN) ─────────────────────────
  async createSiteForTenant(tenantId: string, name: string, address?: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);

    const site = await this.prisma.site.create({
      data:    { name, address, tenantId },
      include: { zones: true },
    });

    return toApiResponse(site, undefined, 'Site créé');
  }

  // ── Delete a site for a specific tenant (SUPER_ADMIN) ─────────────────────────
  async deleteSiteForTenant(tenantId: string, siteId: string) {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, tenantId },
    });
    if (!site) throw new NotFoundException(`Site ${siteId} not found for tenant ${tenantId}`);

    await this.prisma.site.delete({ where: { id: siteId } });
    return toApiResponse(null, undefined, 'Site supprimé');
  }
}
