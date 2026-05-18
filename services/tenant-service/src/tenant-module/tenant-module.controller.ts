import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import type { JwtPayload } from '@haccp/shared-types';
import { emitAuditEvent } from '@haccp/shared-utils';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SetTenantModulesDtoSchema } from './tenant-module.dto';
import { TenantModuleService } from './tenant-module.service';

// ARCH-DECISION: Module endpoints are nested under /tenants/:id/modules.
// SUPER_ADMIN only — regular ADMIN cannot change their own tenant's feature set.
// The /tenants/me/modules GET (for regular users checking what's enabled) could
// be added here later when we inject modules into the frontend sidebar.
@Controller('tenants/:id/modules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class TenantModuleController {
  constructor(private readonly moduleService: TenantModuleService) {}

  @Get()
  getModules(@Param('id') id: string) {
    return this.moduleService.getModules(id);
  }

  @Put()
  async setModules(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: JwtPayload,
  ) {
    const dto    = SetTenantModulesDtoSchema.parse(body);
    const result = await this.moduleService.setModules(id, dto);

    void emitAuditEvent({
      userId:     actor.sub,
      action:     'UPDATE',
      resource:   'tenant_modules',
      resourceId: id,
      tenantId:   actor.tenantId,
      payload:    { modulesChanged: dto.modules.length },
    });

    return result;
  }
}
