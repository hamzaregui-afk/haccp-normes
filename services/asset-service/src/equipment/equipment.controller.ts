import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { JwtPayload } from '@haccp/shared-types';
import { emitAuditEvent, extractResourceId } from '@haccp/shared-utils';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateEquipmentDtoSchema, EquipmentQuerySchema, UpdateEquipmentDtoSchema } from './dto/equipment.dto';
import { EquipmentService } from './equipment.service';

@Controller('equipments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'OPERATOR', 'VIEWER')
  findAll(@CurrentUser() user: JwtPayload, @Query() query: unknown) {
    return this.equipmentService.findAll(user.tenantId, EquipmentQuerySchema.parse(query));
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'OPERATOR', 'VIEWER')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.equipmentService.findOne(id, user.tenantId);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  async create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto    = CreateEquipmentDtoSchema.parse(body);
    const result = await this.equipmentService.create(dto, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'CREATE',
      resource:   'equipments',
      ...(extractResourceId(result) !== undefined && { resourceId: extractResourceId(result) }),
      tenantId:   user.tenantId,
      payload:    { name: dto.name },
    });

    return result;
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  async update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto    = UpdateEquipmentDtoSchema.parse(body);
    const result = await this.equipmentService.update(id, dto, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'UPDATE',
      resource:   'equipments',
      resourceId: id,
      tenantId:   user.tenantId,
    });

    return result;
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const result = await this.equipmentService.remove(id, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'DELETE',
      resource:   'equipments',
      resourceId: id,
      tenantId:   user.tenantId,
    });

    return result;
  }
}
