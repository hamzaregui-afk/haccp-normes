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
import { MediaProfileService } from './media-profile.service';
import {
  CreateMediaProfileSchema,
  UpdateMediaProfileSchema,
  MediaProfileQuerySchema,
} from './dto/media-profile.dto';

const ADMIN_ROLES = ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] as const;
const READ_ROLES  = ['ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'OPERATOR', 'VIEWER'] as const;

@ApiTags('media-profiles')
@ApiBearerAuth()
@Controller('media-profiles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MediaProfileController {
  constructor(private readonly service: MediaProfileService) {}

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List media profiles for the current tenant (paginated)' })
  findAll(@CurrentUser() user: JwtPayload, @Query() rawQuery: unknown) {
    const query = MediaProfileQuerySchema.parse(rawQuery);
    return this.service.findAll(user.tenantId, query);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get a single media profile by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user.tenantId);
  }

  @Post()
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Create a media profile' })
  async create(@Body() rawBody: unknown, @CurrentUser() user: JwtPayload) {
    const dto    = CreateMediaProfileSchema.parse(rawBody);
    const result = await this.service.create(dto, user.tenantId);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      userId:     user.sub,
      action:     'CREATE',
      resource:   'media_profiles',
      resourceId: (result.data as { id: string }).id,
      payload:    { name: dto.name, mediaType: dto.mediaType },
    });

    return result;
  }

  @Patch(':id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Update a media profile' })
  async update(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const dto    = UpdateMediaProfileSchema.parse(rawBody);
    const result = await this.service.update(id, dto, user.tenantId);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      userId:     user.sub,
      action:     'UPDATE',
      resource:   'media_profiles',
      resourceId: id,
      payload:    dto as Record<string, unknown>,
    });

    return result;
  }

  @Delete(':id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Delete a media profile' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const result = await this.service.remove(id, user.tenantId);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      userId:     user.sub,
      action:     'DELETE',
      resource:   'media_profiles',
      resourceId: id,
    });

    return result;
  }
}
