import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProductDto, UpdateProductDto, ProductQuery } from './dto/product.dto';

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: ProductQuery) {
    const { page, limit, search, category, supplierId, active } = query;

    const where = {
      tenantId,
      ...(active !== undefined ? { isActive: active === 'true' } : { isActive: true }),
      ...(category   ? { category: { equals: category, mode: 'insensitive' as const } } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { code: { contains: search, mode: 'insensitive' as const } },
          { category: { contains: search, mode: 'insensitive' as const } },
        ],
      } : {}),
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          supplier: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return toApiResponse(products, toPaginationMeta(total, { page, limit }));
  }

  async findCategories(tenantId: string): Promise<string[]> {
    const result = await this.prisma.product.findMany({
      where: { tenantId, isActive: true },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    return result.map((r) => r.category);
  }

  async findOne(id: string, tenantId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
      include: { supplier: { select: { id: true, name: true, code: true } } },
    });
    if (!product) throw new NotFoundException(`Produit ${id} introuvable`);
    return toApiResponse(product);
  }

  async create(dto: CreateProductDto, tenantId: string) {
    const exists = await this.prisma.product.findFirst({
      where: { code: dto.code, tenantId },
    });
    if (exists) throw new ConflictException(`Code produit "${dto.code}" déjà utilisé`);

    const product = await this.prisma.product.create({
      data: { ...dto, tenantId },
      include: { supplier: { select: { id: true, name: true, code: true } } },
    });
    return toApiResponse(product, undefined, 'Produit créé');
  }

  async update(id: string, dto: UpdateProductDto, tenantId: string) {
    await this.findOne(id, tenantId);
    const product = await this.prisma.product.update({
      where: { id },
      data: dto,
      include: { supplier: { select: { id: true, name: true, code: true } } },
    });
    return toApiResponse(product);
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    // Soft delete — products may be referenced in NC history
    await this.prisma.product.update({ where: { id }, data: { isActive: false } });
    return toApiResponse(null, undefined, 'Produit désactivé');
  }
}
