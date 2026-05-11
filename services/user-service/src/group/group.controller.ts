import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { JwtPayload } from '@haccp/shared-types';
import { emitAuditEvent, extractResourceId } from '@haccp/shared-utils';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AddMemberDtoSchema, CreateGroupDtoSchema } from './dto/create-group.dto';
import { GroupService } from './group.service';

@Controller('groups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.groupService.findAll(user.tenantId, Number(page ?? 1), Number(limit ?? 20));
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.groupService.findOne(id, user.tenantId);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  async create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto    = CreateGroupDtoSchema.parse(body);
    const result = await this.groupService.create(dto, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'CREATE',
      resource:   'groups',
      ...(extractResourceId(result) !== undefined && { resourceId: extractResourceId(result) }),
      tenantId:   user.tenantId,
      payload:    { name: dto.name },
    });

    return result;
  }

  @Post(':id/members')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  async addMember(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto    = AddMemberDtoSchema.parse(body);
    const result = await this.groupService.addMember(id, dto, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'UPDATE',
      resource:   'groups',
      resourceId: id,
      tenantId:   user.tenantId,
      payload:    { action: 'addMember', memberId: dto.userId },
    });

    return result;
  }

  @Delete(':id/members/:userId')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.groupService.removeMember(id, userId, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'UPDATE',
      resource:   'groups',
      resourceId: id,
      tenantId:   user.tenantId,
      payload:    { action: 'removeMember', memberId: userId },
    });

    return result;
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const result = await this.groupService.remove(id, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'DELETE',
      resource:   'groups',
      resourceId: id,
      tenantId:   user.tenantId,
    });

    return result;
  }
}
