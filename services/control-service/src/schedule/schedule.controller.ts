/**
 * schedule.controller.ts
 *
 * REST API for ControlSchedule (recurring task schedules).
 *
 * Routes (all under /api/v1/controls/schedules):
 *   GET    /              — list all schedules for the tenant
 *   GET    /:id           — get one schedule
 *   GET    /:id/preview   — preview the next N occurrences
 *   POST   /              — create a new recurring schedule
 *   PATCH  /:id           — update schedule (reassign, set endDate, toggle active)
 *   DELETE /:id           — soft-deactivate schedule
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { JwtPayload } from '@haccp/shared-types';
import { emitAuditEvent } from '@haccp/shared-utils';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { Roles }        from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import {
  CreateScheduleDtoSchema,
  UpdateScheduleDtoSchema,
  ScheduleQuerySchema,
} from './dto/schedule.dto';
import { ScheduleService } from './schedule.service';

@Controller('controls/schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  // ── List ────────────────────────────────────────────────────────────────────

  @Get()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'VIEWER')
  findAll(@CurrentUser() user: JwtPayload, @Query() query: unknown) {
    return this.scheduleService.findAll(
      user.tenantId,
      ScheduleQuerySchema.parse(query),
    );
  }

  // ── Single ───────────────────────────────────────────────────────────────────

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'VIEWER')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.scheduleService.findOne(id, user.tenantId);
  }

  // ── Preview upcoming occurrences ─────────────────────────────────────────────

  @Get(':id/preview')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'VIEWER')
  preview(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Query('count') count?: string,
  ) {
    return this.scheduleService.previewOccurrences(
      id,
      user.tenantId,
      count ? Math.min(Math.max(parseInt(count, 10) || 10, 1), 50) : 10,
    );
  }

  // ── Create ───────────────────────────────────────────────────────────────────

  @Post()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  async create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto    = CreateScheduleDtoSchema.parse(body);
    const result = await this.scheduleService.create(dto, user.tenantId, user.sub);

    void emitAuditEvent({
      userId:     user.sub,
      tenantId:   user.tenantId,
      action:     'CREATE',
      resource:   'control-schedules',
      resourceId: (result as { data?: { id?: string } }).data?.id,
      payload:    { frequency: dto.frequency, templateId: dto.templateId },
    });

    return result;
  }

  // ── Update ───────────────────────────────────────────────────────────────────

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  async update(
    @Param('id') id: string,
    @Body()      body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const dto    = UpdateScheduleDtoSchema.parse(body);
    const result = await this.scheduleService.update(id, dto, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      tenantId:   user.tenantId,
      action:     'UPDATE',
      resource:   'control-schedules',
      resourceId: id,
      payload:    dto,
    });

    return result;
  }

  // ── Deactivate ───────────────────────────────────────────────────────────────

  @Delete(':id')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  async deactivate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const result = await this.scheduleService.deactivate(id, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      tenantId:   user.tenantId,
      action:     'DELETE',
      resource:   'control-schedules',
      resourceId: id,
      payload:    { deactivated: true },
    });

    return result;
  }
}
