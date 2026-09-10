import { Body, Controller, Delete, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '@haccp/shared-types';
import { emitAuditEvent } from '@haccp/shared-utils';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrintProviderConfigService } from './print-provider-config.service';
import { UpdatePrintProviderConfigSchema, PrintNodeProbeSchema } from './dto/print-provider-config.dto';

// RBAC matrix: print settings management = ADMIN/SUPER_ADMIN only.
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'] as const;

@ApiTags('print-provider-config')
@ApiBearerAuth()
@Controller('print-provider-config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PrintProviderConfigController {
  constructor(private readonly service: PrintProviderConfigService) {}

  @Get()
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: "Statut d'impression du tenant (la clé PrintNode n'est jamais renvoyée)" })
  getStatus(@CurrentUser() user: JwtPayload) {
    return this.service.getStatus(user.tenantId);
  }

  @Get('providers')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Catalogue des modes de connexion (pilote le formulaire dynamique)' })
  providers() {
    return this.service.providers();
  }

  @Post('printnode/test')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Tester la connexion PrintNode (clé fournie dans le corps, ou clé enregistrée)' })
  testPrintNode(@Body() rawBody: unknown, @CurrentUser() user: JwtPayload) {
    const dto = PrintNodeProbeSchema.parse(rawBody);
    return this.service.printNodeTest(user.tenantId, dto.apiKey);
  }

  @Post('printnode/computers')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Lister les ordinateurs PrintNode' })
  printNodeComputers(@Body() rawBody: unknown, @CurrentUser() user: JwtPayload) {
    const dto = PrintNodeProbeSchema.parse(rawBody);
    return this.service.printNodeComputers(user.tenantId, dto.apiKey);
  }

  @Post('printnode/printers')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Lister les imprimantes PrintNode (option: computerId)' })
  printNodePrinters(@Body() rawBody: unknown, @CurrentUser() user: JwtPayload) {
    const dto = PrintNodeProbeSchema.parse(rawBody);
    return this.service.printNodePrinters(user.tenantId, dto.apiKey, dto.computerId);
  }

  @Put()
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Définir/roter la clé PrintNode (chiffrée) et/ou activer PrintNode' })
  async update(@Body() rawBody: unknown, @CurrentUser() user: JwtPayload) {
    const dto    = UpdatePrintProviderConfigSchema.parse(rawBody);
    const result = await this.service.update(user.tenantId, dto);

    // SECURITY: never audit-log the key itself — only that it was rotated + the flag.
    void emitAuditEvent({
      tenantId: user.tenantId,
      userId:   user.sub,
      action:   'UPDATE',
      resource: 'print_provider_config',
      payload:  { keyRotated: dto.printNodeApiKey !== undefined, printNodeEnabled: dto.printNodeEnabled },
    }).catch(() => { /* fire-and-forget: audit failure must never surface */ });

    return result;
  }

  @Delete('printnode-key')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Supprimer la clé PrintNode du tenant et désactiver PrintNode' })
  async clear(@CurrentUser() user: JwtPayload) {
    const result = await this.service.clearPrintNodeKey(user.tenantId);

    void emitAuditEvent({
      tenantId: user.tenantId,
      userId:   user.sub,
      action:   'DELETE',
      resource: 'print_provider_config',
      payload:  { printNodeKeyCleared: true },
    }).catch(() => { /* fire-and-forget */ });

    return result;
  }
}
