import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(page = 1, limit = 20, search?: string) {
    const where = search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { slug: { contains: search, mode: 'insensitive' as const } }] }
      : {};

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { sites: true } } },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return toApiResponse(tenants, toPaginationMeta(total, page, limit));
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { sites: { include: { zones: true } } },
    });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return toApiResponse(tenant);
  }

  async create(dto: CreateTenantDto) {
    const exists = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } });
    if (exists) throw new ConflictException(`Slug "${dto.slug}" already taken`);

    const tenant = await this.prisma.tenant.create({ data: dto });
    return toApiResponse(tenant, undefined, 'Tenant created');
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.findOne(id);
    const tenant = await this.prisma.tenant.update({ where: { id }, data: dto });
    return toApiResponse(tenant);
  }

  async remove(id: string) {
    await this.findOne(id);
    // Soft-delete: set status to ARCHIVED instead of deleting
    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
    return toApiResponse(tenant, undefined, 'Tenant archived');
  }
}
