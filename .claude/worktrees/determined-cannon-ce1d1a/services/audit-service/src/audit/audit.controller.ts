import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import type { JwtPayload } from '@haccp/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuditQuerySchema, CreateAuditLogDtoSchema } from './dto/audit.dto';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /** Internal endpoint — called by other services to append a log entry. */
  @Post()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'OPERATOR', 'QUALITY_OFFICER', 'VIEWER')
  create(@Body() body: unknown, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    const dto = CreateAuditLogDtoSchema.parse(body);
    const ipAddress = (
      req.headers['x-real-ip'] ??
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.ip
    ) as string | undefined;
    return this.auditService.log({ ...dto, ipAddress }, user.tenantId);
  }

  @Get()
  @Roles('ADMIN', 'SUPER_ADMIN')
  findAll(@CurrentUser() user: JwtPayload, @Req() req: Request & { query: unknown }) {
    return this.auditService.findAll(user.tenantId, AuditQuerySchema.parse(req.query));
  }

  @Get(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.auditService.findOne(id, user.tenantId);
  }
}
