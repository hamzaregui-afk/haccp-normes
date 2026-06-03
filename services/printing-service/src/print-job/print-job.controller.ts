import {
  Body,
  Controller,
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
import { PrintJobService } from './print-job.service';
import { CreatePrintJobSchema, PrintJobQuerySchema, PrintJobStatusSchema } from './dto/print-job.dto';
import { z } from 'zod';

const UpdateJobStatusSchema = z.object({
  status:       PrintJobStatusSchema,
  errorMessage: z.string().max(500).optional(),
});

// All roles that can initiate a print (OPERATOR needs DLC printing on mobile)
const PRINT_ROLES = ['ADMIN', 'MANAGER', 'SUPER_ADMIN', 'OPERATOR', 'QUALITY_OFFICER'] as const;
// OPERATOR included so the local print agent (running as operator) can read its jobs
const READ_ROLES  = ['ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'OPERATOR'] as const;

@ApiTags('print-jobs')
@ApiBearerAuth()
@Controller('print-jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PrintJobController {
  constructor(private readonly printJobService: PrintJobService) {}

  // GET /print-jobs
  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List print job history for the current tenant (paginated)' })
  findAll(@CurrentUser() user: JwtPayload, @Query() rawQuery: unknown) {
    const query = PrintJobQuerySchema.parse(rawQuery);
    return this.printJobService.findAll(user.tenantId, query);
  }

  // GET /print-jobs/:id — declared before /:id/retry to avoid route conflict
  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get a single print job by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.printJobService.findOne(id, user.tenantId);
  }

  // POST /print-jobs
  @Post()
  @Roles(...PRINT_ROLES)
  @ApiOperation({ summary: 'Submit a new print job' })
  async create(@Body() rawBody: unknown, @CurrentUser() user: JwtPayload) {
    const dto    = CreatePrintJobSchema.parse(rawBody);
    const result = await this.printJobService.create(dto, user.tenantId, user.sub);

    void emitAuditEvent({
      tenantId:   user.tenantId,
      userId:     user.sub,
      action:     'CREATE',
      resource:   'print_jobs',
      resourceId: (result.data as { id: string }).id,
      payload:    { labelType: dto.labelType, copies: dto.copies },
    });

    return result;
  }

  // PATCH /print-jobs/:id — used by Local Print Agent to update job status
  @Patch(':id')
  @Roles(...PRINT_ROLES)
  @ApiOperation({ summary: 'Update print job status (used by Local Print Agent)' })
  async updateStatus(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const dto = UpdateJobStatusSchema.parse(rawBody);
    return this.printJobService.updateStatus(id, user.tenantId, dto.status, dto.errorMessage);
  }

  // POST /print-jobs/:id/retry
  @Post(':id/retry')
  @Roles(...PRINT_ROLES)
  @ApiOperation({ summary: 'Retry a failed print job' })
  async retry(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.printJobService.retry(id, user.tenantId);
  }
}
