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
import { PrinterService } from './printer.service';
import { CreatePrinterSchema, UpdatePrinterSchema, PrinterQuerySchema } from './dto/printer.dto';

const ADMIN_ROLES  = ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] as const;
const READ_ROLES   = ['ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'OPERATOR', 'VIEWER'] as const;

@ApiTags('printers')
@ApiBearerAuth()
@Controller('printers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PrinterController {
  constructor(private readonly printerService: PrinterService) {}

  // GET /printers
  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List printers for the current tenant (paginated)' })
  findAll(@CurrentUser() user: JwtPayload, @Query() rawQuery: unknown) {
    const query = PrinterQuerySchema.parse(rawQuery);
    return this.printerService.findAll(user.tenantId, query);
  }

  // GET /printers/:id
  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get a single printer by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.printerService.findOne(id, user.tenantId);
  }

  // POST /printers
  @Post()
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Register a new printer' })
  async create(@Body() rawBody: unknown, @CurrentUser() user: JwtPayload) {
    const dto    = CreatePrinterSchema.parse(rawBody);
    const result = await this.printerService.create(dto, user.tenantId);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      userId:     user.sub,
      action:     'CREATE',
      resource:   'printers',
      resourceId: (result.data as { id: string }).id,
      payload:    { name: dto.name, connectionType: dto.connectionType },
    });

    return result;
  }

  // PATCH /printers/:id
  @Patch(':id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Update a printer configuration' })
  async update(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const dto    = UpdatePrinterSchema.parse(rawBody);
    const result = await this.printerService.update(id, dto, user.tenantId);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      userId:     user.sub,
      action:     'UPDATE',
      resource:   'printers',
      resourceId: id,
      payload:    dto as Record<string, unknown>,
    });

    return result;
  }

  // PATCH /printers/:id/set-default
  @Patch(':id/set-default')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Set a printer as the default for this tenant' })
  async setDefault(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const result = await this.printerService.setDefault(id, user.tenantId);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      userId:     user.sub,
      action:     'UPDATE',
      resource:   'printers',
      resourceId: id,
      payload:    { action: 'set-default' },
    });

    return result;
  }

  // DELETE /printers/:id
  @Delete(':id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Remove a printer' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const result = await this.printerService.remove(id, user.tenantId);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      userId:     user.sub,
      action:     'DELETE',
      resource:   'printers',
      resourceId: id,
    });

    return result;
  }
}
