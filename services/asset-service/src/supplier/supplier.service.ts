import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSupplierDto, UpdateSupplierDto, SupplierQuery } from './dto/supplier.dto';

@Injectable()
export class SupplierService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: SupplierQuery) {
    const { page, limit, search, active } = query;

    const where = {
      tenantId,
      ...(active !== undefined ? { isActive: active === 'true' } : {}),
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { code: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      } : {}),
    };

    const [suppliers, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { products: true } } },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return toApiResponse(suppliers, toPaginationMeta(total, page, limit));
  }

  async findOne(id: string, tenantId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
      include: { products: { where: { isActive: true }, select: { id: true, code: true, name: true } } },
    });
    if (!supplier) throw new NotFoundException(`Supplier ${id} not found`);
    return toApiResponse(supplier);
  }

  async create(dto: CreateSupplierDto, tenantId: string) {
    const exists = await this.prisma.supplier.findFirst({ where: { code: dto.code, tenantId } });
    if (exists) throw new ConflictException(`Code fournisseur "${dto.code}" déjà utilisé`);

    const supplier = await this.prisma.supplier.create({ data: { ...dto, tenantId } });
    return toApiResponse(supplier, undefined, 'Fournisseur créé');
  }

  async update(id: string, dto: UpdateSupplierDto, tenantId: string) {
    await this.findOne(id, tenantId);
    const supplier = await this.prisma.supplier.update({ where: { id }, data: dto });
    return toApiResponse(supplier);
  }

  async remove(id: string, tenantId: string) {
    const { data: supplier } = await this.findOne(id, tenantId);

    // Soft delete — check no active products linked
    const linked = await this.prisma.product.count({
      where: { supplierId: id, isActive: true },
    });
    if (linked > 0) {
      // Soft-delete instead of hard delete when products are linked
      await this.prisma.supplier.update({ where: { id }, data: { isActive: false } });
      return toApiResponse(supplier, undefined, 'Fournisseur désactivé (produits liés conservés)');
    }

    await this.prisma.supplier.delete({ where: { id } });
    return toApiResponse(null, undefined, 'Fournisseur supprimé');
  }
}
