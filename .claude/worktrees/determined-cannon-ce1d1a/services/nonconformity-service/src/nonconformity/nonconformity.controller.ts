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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '@haccp/shared-types';
import { emitAuditEvent, extractResourceId, publishDomainEvent } from '@haccp/shared-utils';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NonconformityService } from './nonconformity.service';
import {
  CreateNcDtoSchema,
  NcQuerySchema,
  UpdateNcDtoSchema,
} from './dto/nonconformity.dto';

// ─── Read-only roles (view access) ───────────────────────────────────────────
const READ_ROLES = ['ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'VIEWER'] as const;

// ─── Write roles ──────────────────────────────────────────────────────────────
const MANAGE_ROLES  = ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] as const;
const CREATE_ROLES  = ['ADMIN', 'MANAGER', 'SUPER_ADMIN', 'OPERATOR'] as const;
const DELETE_ROLES  = ['ADMIN', 'SUPER_ADMIN'] as const;

@ApiTags('nonconformities')
@ApiBearerAuth()
@Controller('nonconformities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NonconformityController {
  constructor(private readonly nonconformityService: NonconformityService) {}

  // GET /nonconformities/stats  — must be declared BEFORE /:id to avoid clash
  @Get('stats')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get NC counts by status for the current tenant' })
  getStats(@CurrentUser() user: JwtPayload) {
    return this.nonconformityService.getStats(user.tenantId);
  }

  // GET /nonconformities
  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List non-conformities (paginated, filterable)' })
  findAll(@CurrentUser() user: JwtPayload, @Query() rawQuery: unknown) {
    const query = NcQuerySchema.parse(rawQuery);
    return this.nonconformityService.findAll(user.tenantId, query);
  }

  // GET /nonconformities/:id
  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get a single non-conformity by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.nonconformityService.findOne(id, user.tenantId);
  }

  // POST /nonconformities
  @Post()
  @Roles(...CREATE_ROLES)
  @ApiOperation({ summary: 'Report a new non-conformity' })
  async create(@Body() rawBody: unknown, @CurrentUser() user: JwtPayload) {
    const dto = CreateNcDtoSchema.parse(rawBody);
    const result = await this.nonconformityService.create(dto, user.tenantId, user.sub);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'CREATE',
      resource:   'nonconformities',
      ...(extractResourceId(result) !== undefined && { resourceId: extractResourceId(result) }),
      tenantId:   user.tenantId,
      payload:    { severity: dto.severity, category: dto.category },
    });

    // Broadcast domain event so notification-service can push real-time alerts
    void publishDomainEvent({
      eventType: 'nonconformity.nc.created',
      tenantId:  user.tenantId,
      payload: {
        ncId:        (result as { data?: { id?: string } }).data?.id,
        severity:    dto.severity,
        category:    dto.category,
        description: dto.description,
        createdBy:   user.sub,
      },
    });

    return result;
  }

  // PATCH /nonconformities/:id
  @Patch(':id')
  @Roles(...MANAGE_ROLES)
  @ApiOperation({ summary: 'Update status or corrective action of a non-conformity' })
  async update(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const dto = UpdateNcDtoSchema.parse(rawBody);
    const result = await this.nonconformityService.update(id, dto, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'UPDATE',
      resource:   'nonconformities',
      resourceId: id,
      tenantId:   user.tenantId,
      payload:    { status: dto.status },
    });

    return result;
  }

  // POST /nonconformities/:id/photos
  @Post(':id/photos')
  @Roles(...CREATE_ROLES)
  @ApiOperation({ summary: 'Upload a photo for a non-conformity (multipart/form-data, field: file)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } })) // 10 MB max
  uploadPhoto(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.nonconformityService.addPhoto(id, user.tenantId, file);
  }

  // DELETE /nonconformities/:id
  @Delete(':id')
  @Roles(...DELETE_ROLES)
  @ApiOperation({ summary: 'Delete an OPEN or REJECTED non-conformity' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const result = await this.nonconformityService.remove(id, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'DELETE',
      resource:   'nonconformities',
      resourceId: id,
      tenantId:   user.tenantId,
    });

    return result;
  }
}
