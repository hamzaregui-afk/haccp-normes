import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { JwtPayload } from '@haccp/shared-types';
import { emitAuditEvent, extractResourceId, publishDomainEvent } from '@haccp/shared-utils';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateTemplateDtoSchema,
  UpdateTemplateDtoSchema,
  CreateTaskDtoSchema,
  UpdateTaskDtoSchema,
  TemplateQuerySchema,
  TaskQuerySchema,
} from './dto/control.dto';
import { ControlService } from './control.service';

@Controller('controls')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ControlController {
  constructor(private readonly controlService: ControlService) {}

  // ─── Templates ─────────────────────────────────────────────────────────────

  @Get('templates')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'VIEWER')
  findAllTemplates(@CurrentUser() user: JwtPayload, @Query() query: unknown) {
    return this.controlService.findAllTemplates(
      user.tenantId,
      TemplateQuerySchema.parse(query),
    );
  }

  @Get('templates/:id')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'VIEWER')
  findOneTemplate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.controlService.findOneTemplate(id, user.tenantId);
  }

  @Post('templates')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  async createTemplate(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto    = CreateTemplateDtoSchema.parse(body);
    const result = await this.controlService.createTemplate(dto, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'CREATE',
      resource:   'controls',
      ...(extractResourceId(result) !== undefined && { resourceId: extractResourceId(result) }),
      tenantId:   user.tenantId,
      payload:    { name: dto.name, type: dto.type },
    });

    return result;
  }

  @Patch('templates/:id')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  async updateTemplate(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const dto    = UpdateTemplateDtoSchema.parse(body);
    const result = await this.controlService.updateTemplate(id, dto, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'UPDATE',
      resource:   'controls',
      resourceId: id,
      tenantId:   user.tenantId,
    });

    return result;
  }

  @Delete('templates/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async deleteTemplate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const result = await this.controlService.deleteTemplate(id, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'DELETE',
      resource:   'controls',
      resourceId: id,
      tenantId:   user.tenantId,
    });

    return result;
  }

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  @Get('tasks')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'OPERATOR', 'QUALITY_OFFICER', 'VIEWER')
  findAllTasks(@CurrentUser() user: JwtPayload, @Query() query: unknown) {
    return this.controlService.findAllTasks(
      user.tenantId,
      TaskQuerySchema.parse(query),
    );
  }

  @Get('tasks/:id')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'OPERATOR', 'QUALITY_OFFICER')
  findOneTask(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.controlService.findOneTask(id, user.tenantId);
  }

  @Post('tasks')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  async createTask(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto    = CreateTaskDtoSchema.parse(body);
    const result = await this.controlService.createTask(dto, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'CREATE',
      resource:   'controls',
      ...(extractResourceId(result) !== undefined && { resourceId: extractResourceId(result) }),
      tenantId:   user.tenantId,
    });

    return result;
  }

  @Patch('tasks/:id')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'OPERATOR')
  async updateTask(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const dto    = UpdateTaskDtoSchema.parse(body);
    const result = await this.controlService.updateTask(id, dto, user.tenantId);

    // ARCH-DECISION: task completion is the most audit-critical event in the
    // HACCP workflow. We emit UPDATE for all task patches but tag status in
    // the payload so audit reports can filter by COMPLETED status specifically.
    void emitAuditEvent({
      userId:     user.sub,
      action:     'UPDATE',
      resource:   'controls',
      resourceId: id,
      tenantId:   user.tenantId,
      payload:    { status: dto.status },
    });

    // Publish domain event only when the task is explicitly completed —
    // notification-service broadcasts to the tenant so managers see it in real-time.
    if (dto.status === 'COMPLETED') {
      void publishDomainEvent({
        eventType: 'control.task.completed',
        tenantId:  user.tenantId,
        payload: {
          taskId:      id,
          completedBy: user.sub,
          status:      'COMPLETED',
        },
      });
    }

    return result;
  }

  // ─── Stats ─────────────────────────────────────────────────────────────────

  @Get('stats')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'VIEWER')
  getStats(@CurrentUser() user: JwtPayload) {
    return this.controlService.getStats(user.tenantId);
  }

  // ─── Photos ────────────────────────────────────────────────────────────────

  @Post('tasks/:id/photos')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'OPERATOR')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async addTaskPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.controlService.addPhoto(id, user.tenantId, file);
  }

  @Get('tasks/:id/photos')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'OPERATOR', 'QUALITY_OFFICER', 'VIEWER')
  getTaskPhotos(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.controlService.getPhotos(id, user.tenantId);
  }
}
