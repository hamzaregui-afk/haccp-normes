import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { JwtPayload } from '@haccp/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateSiteDtoSchema, CreateZoneDtoSchema, UpdateSiteDtoSchema, UpdateZoneDtoSchema } from './dto/site.dto';
import { SiteService } from './site.service';

@Controller('sites')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SiteController {
  constructor(private readonly siteService: SiteService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'OPERATOR', 'QUALITY_OFFICER', 'VIEWER')
  findAll(@CurrentUser() user: JwtPayload) {
    return this.siteService.findAllByTenant(user.tenantId);
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.siteService.create(CreateSiteDtoSchema.parse(body), user.tenantId);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.siteService.update(id, UpdateSiteDtoSchema.parse(body), user.tenantId);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.siteService.remove(id, user.tenantId);
  }

  @Post(':id/zones')
  @Roles('ADMIN', 'SUPER_ADMIN')
  createZone(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.siteService.createZone(id, CreateZoneDtoSchema.parse(body), user.tenantId);
  }

  @Patch(':siteId/zones/:zoneId')
  @Roles('ADMIN', 'SUPER_ADMIN')
  updateZone(
    @Param('siteId') siteId: string,
    @Param('zoneId') zoneId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.siteService.updateZone(siteId, zoneId, UpdateZoneDtoSchema.parse(body), user.tenantId);
  }

  @Delete(':siteId/zones/:zoneId')
  @Roles('ADMIN', 'SUPER_ADMIN')
  removeZone(
    @Param('siteId') siteId: string,
    @Param('zoneId') zoneId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.siteService.removeZone(siteId, zoneId, user.tenantId);
  }
}
