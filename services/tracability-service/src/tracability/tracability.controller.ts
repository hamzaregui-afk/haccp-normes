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
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '@haccp/shared-types';
import { emitAuditEvent, publishDomainEvent } from '@haccp/shared-utils';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TracabilityService } from './tracability.service';
import {
  CreateTracabilitySchema,
  UpdateTracabilitySchema,
  TracabilityQuerySchema,
} from './dto/tracability.dto';

const READ_ROLES   = ['ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'VIEWER', 'OPERATOR'] as const;
const WRITE_ROLES  = ['ADMIN', 'MANAGER', 'SUPER_ADMIN', 'OPERATOR'] as const;
const DELETE_ROLES = ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] as const;

@ApiTags('tracabilities')
@ApiBearerAuth()
@Controller('tracabilities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TracabilityController {
  constructor(private readonly tracabilityService: TracabilityService) {}

  // GET /tracabilities/stats — declared BEFORE /:id to avoid route clash
  @Get('stats')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get tracability counts by status for the current tenant' })
  getStats(@CurrentUser() user: JwtPayload) {
    return this.tracabilityService.getStats(user.tenantId);
  }

  // GET /tracabilities
  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List tracability records (paginated, filterable)' })
  findAll(@CurrentUser() user: JwtPayload, @Query() rawQuery: unknown) {
    const query = TracabilityQuerySchema.parse(rawQuery);
    return this.tracabilityService.findAll(user.tenantId, query);
  }

  // GET /tracabilities/:id
  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get a single tracability record with photos' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tracabilityService.findOne(id, user.tenantId);
  }

  // POST /tracabilities
  @Post()
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Create a new tracability record' })
  async create(@Body() rawBody: unknown, @CurrentUser() user: JwtPayload) {
    const dto    = CreateTracabilitySchema.parse(rawBody);
    const result = await this.tracabilityService.create(dto, user.tenantId, user.sub);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      actorId:    user.sub,
      action:     'CREATE',
      resource:   'TRACABILITY',
      resourceId: (result.data as { id: string }).id,
      details:    { lotNumber: dto.lotNumber, productName: dto.productName },
    });

    void publishDomainEvent({
      eventType: 'tracability.record.created.v1',
      tenantId:  user.tenantId,
      payload:   { tracabilityId: (result.data as { id: string }).id, createdBy: user.sub },
    });

    return result;
  }

  // PATCH /tracabilities/:id
  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Update a tracability record' })
  async update(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const dto    = UpdateTracabilitySchema.parse(rawBody);
    const result = await this.tracabilityService.update(id, dto, user.tenantId);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      actorId:    user.sub,
      action:     'UPDATE',
      resource:   'TRACABILITY',
      resourceId: id,
      details:    dto,
    });

    return result;
  }

  // DELETE /tracabilities/:id
  @Delete(':id')
  @Roles(...DELETE_ROLES)
  @ApiOperation({ summary: 'Delete a tracability record and its photos' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const result = await this.tracabilityService.remove(id, user.tenantId);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      actorId:    user.sub,
      action:     'DELETE',
      resource:   'TRACABILITY',
      resourceId: id,
    });

    return result;
  }

  // POST /tracabilities/:id/photos
  @Post(':id/photos')
  @Roles(...WRITE_ROLES)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a photo for a tracability record' })
  @UseInterceptors(FileInterceptor('file'))
  async addPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('caption') caption: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.tracabilityService.addPhoto(id, user.tenantId, file, caption);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      actorId:    user.sub,
      action:     'CREATE',
      resource:   'TRACABILITY_PHOTO',
      resourceId: id,
    });

    return result;
  }

  // DELETE /tracabilities/:id/photos/:photoId
  @Delete(':id/photos/:photoId')
  @Roles(...DELETE_ROLES)
  @ApiOperation({ summary: 'Delete a photo from a tracability record' })
  async removePhoto(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.tracabilityService.removePhoto(id, photoId, user.tenantId);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      actorId:    user.sub,
      action:     'DELETE',
      resource:   'TRACABILITY_PHOTO',
      resourceId: photoId,
    });

    return result;
  }
}
