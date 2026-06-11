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
import { PrinterAssignmentService } from './printer-assignment.service';
import {
  CreatePrinterAssignmentSchema,
  UpdatePrinterAssignmentSchema,
  PrinterAssignmentQuerySchema,
  ResolvePrinterQuerySchema,
} from './dto/printer-assignment.dto';

const ADMIN_ROLES = ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] as const;
const READ_ROLES  = ['ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'OPERATOR', 'VIEWER'] as const;

@ApiTags('printer-assignments')
@ApiBearerAuth()
@Controller('printer-assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PrinterAssignmentController {
  constructor(private readonly service: PrinterAssignmentService) {}

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List printer assignments for the current tenant' })
  findAll(@CurrentUser() user: JwtPayload, @Query() rawQuery: unknown) {
    const query = PrinterAssignmentQuerySchema.parse(rawQuery);
    return this.service.findAll(user.tenantId, query);
  }

  // ARCH-DECISION: declared BEFORE :id so 'resolve' is not captured as an id param.
  @Get('resolve')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Resolve the printer for a print context (Site/Zone/User/Module)' })
  resolve(@CurrentUser() user: JwtPayload, @Query() rawQuery: unknown) {
    const query = ResolvePrinterQuerySchema.parse(rawQuery);
    return this.service.resolve(user.tenantId, query);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get a single assignment by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user.tenantId);
  }

  @Post()
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Create a printer assignment' })
  async create(@Body() rawBody: unknown, @CurrentUser() user: JwtPayload) {
    const dto    = CreatePrinterAssignmentSchema.parse(rawBody);
    const result = await this.service.create(dto, user.tenantId);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      userId:     user.sub,
      action:     'CREATE',
      resource:   'printer_assignments',
      resourceId: (result.data as { id: string }).id,
      payload:    { scope: dto.scope, referenceId: dto.referenceId, printerId: dto.printerId },
    });

    return result;
  }

  @Patch(':id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Update a printer assignment' })
  async update(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const dto    = UpdatePrinterAssignmentSchema.parse(rawBody);
    const result = await this.service.update(id, dto, user.tenantId);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      userId:     user.sub,
      action:     'UPDATE',
      resource:   'printer_assignments',
      resourceId: id,
      payload:    dto as Record<string, unknown>,
    });

    return result;
  }

  @Delete(':id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Delete a printer assignment' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const result = await this.service.remove(id, user.tenantId);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      userId:     user.sub,
      action:     'DELETE',
      resource:   'printer_assignments',
      resourceId: id,
    });

    return result;
  }
}
