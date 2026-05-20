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

  /**
   * SUPER_ADMIN cross-tenant audit query — returns the audit trail for a
   * specific tenant without the caller needing to be a member of that tenant.
   *
   * ARCH-DECISION: Route is /audit/tenant/:tenantId (not /audit/:tenantId) to
   * avoid ambiguity with the existing GET /audit/:id endpoint.
   * Only SUPER_ADMIN may call this; other roles see HTTP 403 from RolesGuard.
   */
  @Get('tenant/:tenantId')
  @Roles('SUPER_ADMIN')
  findAllForTenant(
    @Param('tenantId') tenantId: string,
    @Req() req: Request & { query: unknown },
  ) {
    return this.auditService.findAllForTenant(tenantId, AuditQuerySchema.parse(req.query));
  }
}
