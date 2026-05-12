import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { JwtPayload } from '@haccp/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles }       from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import {
  CreateDocRequestSchema,
  UpdateDocRequestSchema,
  DocRequestQuerySchema,
} from './dto/document-request.dto';
import { DocumentRequestService } from './document-request.service';

const ADMIN_ROLES = ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] as const;
const READ_ROLES  = ['ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'VIEWER'] as const;

@Controller('document-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentRequestController {
  constructor(private readonly service: DocumentRequestService) {}

  @Get()
  @Roles(...READ_ROLES)
  findAll(@CurrentUser() user: JwtPayload, @Query() query: unknown) {
    const isAdmin = (ADMIN_ROLES as readonly string[]).includes(user.role);
    return this.service.findAll(
      user.tenantId,
      user.sub,
      isAdmin,
      DocRequestQuerySchema.parse(query),
    );
  }

  @Post()
  @Roles(...READ_ROLES)
  create(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    const dto = CreateDocRequestSchema.parse(body);
    return this.service.create(user.tenantId, user.sub, dto);
  }

  @Patch(':id')
  @Roles(...ADMIN_ROLES)
  update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: unknown,
  ) {
    const dto = UpdateDocRequestSchema.parse(body);
    return this.service.update(id, user.tenantId, user.sub, dto);
  }
}
