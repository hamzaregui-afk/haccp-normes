import {
  Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';

import type { JwtPayload } from '@haccp/shared-types';
import { emitAuditEvent, extractResourceId } from '@haccp/shared-utils';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ChangePasswordDtoSchema } from './dto/change-password.dto';
import { CreateUserDtoSchema } from './dto/create-user.dto';
import { UpdateUserDtoSchema } from './dto/update-user.dto';
import { UserService } from './user.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  findAll(@CurrentUser() user: JwtPayload, @Query() query: Record<string, unknown>) {
    return this.userService.findAll(user.tenantId, query);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.userService.findOne(id, user.tenantId);
  }

  /**
   * SUPER_ADMIN cross-tenant endpoint — creates a user inside a specific tenant.
   *
   * ARCH-DECISION: Route is POST /users/for-tenant/:tenantId (not PATCH /users/:id)
   * to be unambiguous. SUPER_ADMIN's JWT tenantId is 'platform' — this endpoint
   * overrides that by using the URL :tenantId parameter as the target tenant.
   * Regular POST /users blocks SUPER_ADMIN to prevent platform-tenant pollution.
   *
   * IMPORTANT: This route MUST be declared BEFORE the generic POST /users route
   * so NestJS resolves 'for-tenant' as a literal segment, not as a :id param.
   */
  @Post('for-tenant/:tenantId')
  @Roles('SUPER_ADMIN')
  async createForTenant(
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
    @CurrentUser() actor: JwtPayload,
  ) {
    if (!tenantId) throw new ForbiddenException('tenantId path parameter is required');
    const dto    = CreateUserDtoSchema.parse(body);
    const result = await this.userService.createForTenant(tenantId, dto, actor);

    void emitAuditEvent({
      userId:     actor.sub,
      action:     'CREATE',
      resource:   'users',
      ...(extractResourceId(result) !== undefined && { resourceId: extractResourceId(result) }),
      tenantId,                            // audit in the TARGET tenant's context
      payload:    { email: dto.email, role: dto.role, createdBySuper: true },
    });

    return result;
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
      ...(extractResourceId(result) !== undefined && { resourceId: extractResourceId(result) }),
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

  @Patch(':id/password')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async changePassword(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const dto = ChangePasswordDtoSchema.parse(body);
    return this.userService.changePassword(id, dto, user.tenantId);
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
