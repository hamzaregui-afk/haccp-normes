import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';

import type { JwtPayload } from '@haccp/shared-types';
import { emitAuditEvent } from '@haccp/shared-utils';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateUserDtoSchema } from './dto/create-user.dto';
import { UpdateUserDtoSchema } from './dto/update-user.dto';
import { UserService } from './user.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @Roles('ADMIN', 'SUPER_ADMIN')
  findAll(@CurrentUser() user: JwtPayload, @Query() query: Record<string, unknown>) {
    return this.userService.findAll(user.tenantId, query);
  }

  @Get(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.userService.findOne(id, user.tenantId);
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  async create(@Body() body: unknown, @CurrentUser() actor: JwtPayload) {
    const dto = CreateUserDtoSchema.parse(body);
    const result = await this.userService.create(dto, actor);

    void emitAuditEvent({
      userId:     actor.sub,
      action:     'CREATE',
      resource:   'users',
      resourceId: (result as { data?: { id?: string } }).data?.id,
      tenantId:   actor.tenantId,
      payload:    { email: dto.email, role: dto.role },
    });

    return result;
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const dto = UpdateUserDtoSchema.parse(body);
    const result = await this.userService.update(id, dto, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'UPDATE',
      resource:   'users',
      resourceId: id,
      tenantId:   user.tenantId,
    });

    return result;
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const result = await this.userService.remove(id, user.tenantId, user);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'DELETE',
      resource:   'users',
      resourceId: id,
      tenantId:   user.tenantId,
    });

    return result;
  }
}
