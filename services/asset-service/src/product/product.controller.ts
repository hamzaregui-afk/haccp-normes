import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { JwtPayload } from '@haccp/shared-types';
import { emitAuditEvent, extractResourceId } from '@haccp/shared-utils';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateProductDtoSchema, ProductQuerySchema, UpdateProductDtoSchema } from './dto/product.dto';
import { ProductService } from './product.service';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'OPERATOR', 'VIEWER')
  findAll(@CurrentUser() user: JwtPayload, @Query() query: unknown) {
    return this.productService.findAll(user.tenantId, ProductQuerySchema.parse(query));
  }

  @Get('categories')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'OPERATOR', 'VIEWER')
  findCategories(@CurrentUser() user: JwtPayload) {
    return this.productService.findCategories(user.tenantId);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'OPERATOR', 'VIEWER')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.productService.findOne(id, user.tenantId);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  async create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto    = CreateProductDtoSchema.parse(body);
    const result = await this.productService.create(dto, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'CREATE',
      resource:   'products',
      ...(extractResourceId(result) !== undefined && { resourceId: extractResourceId(result) }),
      tenantId:   user.tenantId,
      payload:    { name: dto.name },
    });

    return result;
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  async update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto    = UpdateProductDtoSchema.parse(body);
    const result = await this.productService.update(id, dto, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'UPDATE',
      resource:   'products',
      resourceId: id,
      tenantId:   user.tenantId,
    });

    return result;
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const result = await this.productService.remove(id, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'DELETE',
      resource:   'products',
      resourceId: id,
      tenantId:   user.tenantId,
    });

    return result;
  }
}
