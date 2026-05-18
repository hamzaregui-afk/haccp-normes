import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { JwtPayload } from '@haccp/shared-types';
import { emitAuditEvent, extractResourceId } from '@haccp/shared-utils';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateTenantDtoSchema, UpdateTenantDtoSchema } from './dto/tenant.dto';
import { TenantService } from './tenant.service';
import { z } from 'zod';

const CreateSiteForTenantDtoSchema = z.object({
  name:    z.string().min(1).max(200),
  address: z.string().max(500).optional(),
});

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  findAll(
    @Query('page')   page?:   string,
    @Query('limit')  limit?:  string,
    @Query('search') search?: string,
  ) {
    return this.tenantService.findAll(Number(page ?? 1), Number(limit ?? 20), search);
  }

  /**
   * ARCH-DECISION: /me endpoints allow any authenticated tenant member to read
   * (and ADMIN/SUPER_ADMIN to update) their own tenant without exposing the raw
   * tenant UUID in the URL. The tenantId always comes from the validated JWT —
   * never from the request body — so cross-tenant data access is impossible.
   * These routes MUST be declared before /:id to prevent "me" being treated as
   * an ID parameter.
   */
  @Get('me')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'VIEWER')
  findMe(@CurrentUser() user: JwtPayload) {
    return this.tenantService.findOne(user.tenantId);
  }

  @Patch('me')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async updateMe(@Body() body: unknown, @CurrentUser() actor: JwtPayload) {
    const dto    = UpdateTenantDtoSchema.parse(body);
    const result = await this.tenantService.update(actor.tenantId, dto);

    void emitAuditEvent({
      userId:     actor.sub,
      action:     'UPDATE',
      resource:   'tenants',
      resourceId: actor.tenantId,
      tenantId:   actor.tenantId,
    });

    return result;
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantService.findOne(id);
  }

  @Post()
  async create(@Body() body: unknown, @CurrentUser() actor: JwtPayload) {
    const dto    = CreateTenantDtoSchema.parse(body);
    const result = await this.tenantService.create(dto);

    void emitAuditEvent({
      userId:     actor.sub,
      action:     'CREATE',
      resource:   'tenants',
      ...(extractResourceId(result) !== undefined && { resourceId: extractResourceId(result) }),
      tenantId:   actor.tenantId,
      payload:    { name: dto.name },
    });

    return result;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: JwtPayload,
  ) {
    const dto    = UpdateTenantDtoSchema.parse(body);
    const result = await this.tenantService.update(id, dto);

    void emitAuditEvent({
      userId:     actor.sub,
      action:     'UPDATE',
      resource:   'tenants',
      resourceId: id,
      tenantId:   actor.tenantId,
    });

    return result;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    const result = await this.tenantService.remove(id);

    void emitAuditEvent({
      userId:     actor.sub,
      action:     'DELETE',
      resource:   'tenants',
      resourceId: id,
      tenantId:   actor.tenantId,
    });

    return result;
  }

  // ── Sites management for a specific tenant (SUPER_ADMIN cross-tenant) ──────────
  @Get(':id/sites')
  findSites(@Param('id') id: string) {
    return this.tenantService.findSitesForTenant(id);
  }

  @Post(':id/sites')
  async createSite(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: JwtPayload,
  ) {
    const dto    = CreateSiteForTenantDtoSchema.parse(body);
    const result = await this.tenantService.createSiteForTenant(id, dto.name, dto.address);

    void emitAuditEvent({
      userId:     actor.sub,
      action:     'CREATE',
      resource:   'sites',
      resourceId: id,
      tenantId:   actor.tenantId,
      payload:    { siteName: dto.name },
    });

    return result;
  }

  @Delete(':id/sites/:siteId')
  async deleteSite(
    @Param('id')     id:     string,
    @Param('siteId') siteId: string,
    @CurrentUser()   actor:  JwtPayload,
  ) {
    const result = await this.tenantService.deleteSiteForTenant(id, siteId);

    void emitAuditEvent({
      userId:     actor.sub,
      action:     'DELETE',
      resource:   'sites',
      resourceId: siteId,
      tenantId:   actor.tenantId,
    });

    return result;
  }
}
