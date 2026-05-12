import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { JwtPayload } from '@haccp/shared-types';
import { emitAuditEvent } from '@haccp/shared-utils';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CalculateDlcDtoSchema, DlcQuerySchema, PrintLabelDtoSchema } from './dto/dlc.dto';
import { DlcService } from './dlc.service';

@Controller('dlc')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DlcController {
  constructor(private readonly dlcService: DlcService) {}

  /** Pure calculation — no DB write, usable by OPERATOR on mobile. */
  @Post('calculate')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'OPERATOR')
  calculate(@Body() body: unknown) {
    return this.dlcService.calculate(CalculateDlcDtoSchema.parse(body));
  }

  /**
   * Persist a printed label log.
   * printedBy always comes from JWT — never body.
   * We audit the CREATE here because label creation is a regulatory event
   * (traceability of food-safety labels is mandatory under HACCP).
   */
  @Post('labels')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'OPERATOR')
  async printLabel(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto    = PrintLabelDtoSchema.parse(body);
    const result = await this.dlcService.printLabel(dto, user.tenantId, user.sub);

    const labelId = (result as { data?: { label?: { id?: string } } }).data?.label?.id;
    void emitAuditEvent({
      userId:   user.sub,
      action:   'CREATE',
      resource: 'dlc',
      ...(labelId !== undefined && { resourceId: labelId }),
      tenantId: user.tenantId,
      payload:  {
        productName: dto.productName,
        ...(dto.lotNumber !== undefined && { lotNumber: dto.lotNumber }),
      },
    });

    return result;
  }

  @Get('labels/expiring-today')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'VIEWER')
  getExpiringToday(@CurrentUser() user: JwtPayload) {
    return this.dlcService.getExpiringToday(user.tenantId);
  }

  @Get('labels/expiring-soon')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'VIEWER')
  getExpiringSoon(
    @CurrentUser() user: JwtPayload,
    @Query('days') days?: string,
  ) {
    return this.dlcService.getExpiringSoon(user.tenantId, days ? Number(days) : 3);
  }

  @Get('labels')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'VIEWER')
  findAll(@CurrentUser() user: JwtPayload, @Query() query: unknown) {
    return this.dlcService.findAll(user.tenantId, DlcQuerySchema.parse(query));
  }

  @Get('labels/:id')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'VIEWER')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.dlcService.findOne(id, user.tenantId);
  }
}
