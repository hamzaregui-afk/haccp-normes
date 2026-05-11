import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '@haccp/shared-types';
import { emitAuditEvent, extractResourceId, publishDomainEvent } from '@haccp/shared-utils';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReportService } from './report.service';
import {
  CreateReportDtoSchema,
  UpdateReportDtoSchema,
  ReportQuerySchema,
} from './dto/report.dto';
import { generateReportPdf } from './pdf/report-pdf.generator';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  // ─── GET /reports ─────────────────────────────────────────────────────────

  @Get()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'VIEWER')
  findAll(@CurrentUser() user: JwtPayload, @Query() query: unknown) {
    return this.reportService.findAll(user.tenantId, ReportQuerySchema.parse(query));
  }

  // ─── GET /reports/stats ───────────────────────────────────────────────────
  // IMPORTANT: must be declared before :id to avoid route conflict

  @Get('stats')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'VIEWER')
  getStats(@CurrentUser() user: JwtPayload) {
    return this.reportService.getStats(user.tenantId);
  }

  // ─── GET /reports/:id/pdf ─────────────────────────────────────────────────

  @Get(':id/pdf')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'VIEWER')
  async downloadPdf(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    const report    = await this.reportService.findOneRaw(id, user.tenantId);
    const pdfBuffer = await generateReportPdf(report);

    // Audit the export action so inspectors can see who downloaded which report
    void emitAuditEvent({
      userId:     user.sub,
      action:     'EXPORT',
      resource:   'reports',
      resourceId: id,
      tenantId:   user.tenantId,
    });

    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="report-${id.slice(0, 8)}.pdf"`,
      'Content-Length':      pdfBuffer.length.toString(),
    });
    res.end(pdfBuffer);
  }

  // ─── GET /reports/:id ─────────────────────────────────────────────────────

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'VIEWER')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.reportService.findOne(id, user.tenantId);
  }

  // ─── POST /reports ────────────────────────────────────────────────────────

  @Post()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  async create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto    = CreateReportDtoSchema.parse(body);
    const result = await this.reportService.create(dto, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'CREATE',
      resource:   'reports',
      ...(extractResourceId(result) !== undefined && { resourceId: extractResourceId(result) }),
      tenantId:   user.tenantId,
      payload:    { type: dto.type },
    });

    return result;
  }

  // ─── PATCH /reports/:id ───────────────────────────────────────────────────

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const dto    = UpdateReportDtoSchema.parse(body);
    const result = await this.reportService.update(id, dto, user.tenantId, user.sub);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'UPDATE',
      resource:   'reports',
      resourceId: id,
      tenantId:   user.tenantId,
      payload:    { status: dto.status },
    });

    // Publish domain event when a report reaches VALIDATED status —
    // notification-service triggers email to admins + WebSocket push to tenant.
    if (dto.status === 'VALIDATED') {
      void publishDomainEvent({
        eventType: 'report.report.validated',
        tenantId:  user.tenantId,
        payload: {
          reportId:    id,
          validatedBy: user.sub,
          status:      'VALIDATED',
        },
      });
    }

    return result;
  }

  // ─── DELETE /reports/:id ──────────────────────────────────────────────────

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const result = await this.reportService.remove(id, user.tenantId);

    void emitAuditEvent({
      userId:     user.sub,
      action:     'DELETE',
      resource:   'reports',
      resourceId: id,
      tenantId:   user.tenantId,
    });

    return result;
  }
}
