import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { JwtPayload } from '@haccp/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateSiteDtoSchema, CreateZoneDtoSchema } from './dto/site.dto';
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

  @Post(':id/zones')
  @Roles('ADMIN', 'SUPER_ADMIN')
  createZone(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.siteService.createZone(id, CreateZoneDtoSchema.parse(body), user.tenantId);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.siteService.remove(id, user.tenantId);
  }
}
