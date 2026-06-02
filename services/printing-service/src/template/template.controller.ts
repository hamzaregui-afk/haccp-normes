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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '@haccp/shared-types';
import { emitAuditEvent } from '@haccp/shared-utils';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TemplateService } from './template.service';
import { CreateTemplateSchema, UpdateTemplateSchema, TemplateQuerySchema } from './dto/template.dto';

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'] as const;
const READ_ROLES  = ['ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'OPERATOR'] as const;

@ApiTags('printer-templates')
@ApiBearerAuth()
@Controller('printer-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  // GET /printer-templates
  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List label templates for the current tenant (paginated)' })
  findAll(@CurrentUser() user: JwtPayload, @Query() rawQuery: unknown) {
    const query = TemplateQuerySchema.parse(rawQuery);
    return this.templateService.findAll(user.tenantId, query);
  }

  // GET /printer-templates/:id
  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get a single label template by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.templateService.findOne(id, user.tenantId);
  }

  // POST /printer-templates
  @Post()
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Create a new ZPL label template' })
  async create(@Body() rawBody: unknown, @CurrentUser() user: JwtPayload) {
    const dto    = CreateTemplateSchema.parse(rawBody);
    const result = await this.templateService.create(dto, user.tenantId);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      userId:     user.sub,
      action:     'CREATE',
      resource:   'printer_templates',
      resourceId: (result.data as { id: string }).id,
      payload:    { name: dto.name, labelType: dto.labelType },
    });

    return result;
  }

  // PATCH /printer-templates/:id
  @Patch(':id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Update a label template' })
  async update(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const dto    = UpdateTemplateSchema.parse(rawBody);
    const result = await this.templateService.update(id, dto, user.tenantId);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      userId:     user.sub,
      action:     'UPDATE',
      resource:   'printer_templates',
      resourceId: id,
      payload:    dto as Record<string, unknown>,
    });

    return result;
  }

  // DELETE /printer-templates/:id
  @Delete(':id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Delete a label template' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const result = await this.templateService.remove(id, user.tenantId);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      userId:     user.sub,
      action:     'DELETE',
      resource:   'printer_templates',
      resourceId: id,
    });

    return result;
  }
}
