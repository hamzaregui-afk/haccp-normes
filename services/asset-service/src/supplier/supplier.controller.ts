import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { JwtPayload } from '@haccp/shared-types';
import { emitAuditEvent, extractResourceId } from '@haccp/shared-utils';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateSupplierDtoSchema, SupplierQuerySchema, UpdateSupplierDtoSchema } from './dto/supplier.dto';
import { SupplierService } from './supplier.service';

@Controller('suppliers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'OPERATOR', 'VIEWER')
  findAll(@CurrentUser() user: JwtPayload, @Query() query: unknown) {
    return this.supplierService.findAll(user.tenantId, SupplierQuerySchema.parse(query));
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'OPERATOR', 'VIEWER')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.supplierService.findOne(id, user.tenantId);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  async create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto    = CreateSupplierDtoSchema.parse(body);
    const result = await this.supplierService.create(dto, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'CREATE',
      resource:   'suppliers',
      ...(extractResourceId(result) !== undefined && { resourceId: extractResourceId(result) }),
      tenantId:   user.tenantId,
      payload:    { name: dto.name },
    });

    return result;
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  async update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto    = UpdateSupplierDtoSchema.parse(body);
    const result = await this.supplierService.update(id, dto, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'UPDATE',
      resource:   'suppliers',
      resourceId: id,
      tenantId:   user.tenantId,
    });

    return result;
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const result = await this.supplierService.remove(id, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'DELETE',
      resource:   'suppliers',
      resourceId: id,
      tenantId:   user.tenantId,
    });

    return result;
  }
}
