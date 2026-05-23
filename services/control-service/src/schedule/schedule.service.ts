/**
 * schedule.service.ts
 *
 * CRUD + business logic for ControlSchedule (recurring task schedules).
 *
 * ARCH-DECISION: On create, nextRunAt is computed immediately so the
 * TaskGeneratorService picks up the schedule on its next 15-minute tick
 * without waiting for a manual trigger.
 *
 * ARCH-DECISION: "delete" is a soft-deactivation (isActive = false) to
 * preserve the scheduleId FK on already-generated ControlTasks and maintain
 * the audit trail of what generated those tasks.
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { toPaginationMeta, toApiResponse } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { RecurrenceEngine } from './recurrence/recurrence.engine';
import type {
  CreateScheduleDto,
  UpdateScheduleDto,
  ScheduleQuery,
  RecurrenceConfig,
} from './dto/schedule.dto';

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── List ────────────────────────────────────────────────────────────────────

  async findAll(tenantId: string, query: ScheduleQuery) {
    const { page, limit, templateId, isActive } = query;
    const skip = (page - 1) * limit;

    const where = {
      tenantId,
      ...(templateId !== undefined ? { templateId }   : {}),
      ...(isActive   !== undefined ? { isActive }      : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.controlSchedule.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { template: { select: { id: true, name: true } } },
      }),
      this.prisma.controlSchedule.count({ where }),
    ]);

    return toApiResponse(items, toPaginationMeta(total, { page, limit }));
  }

  // ── Single ───────────────────────────────────────────────────────────────────

  async findOne(id: string, tenantId: string) {
    const schedule = await this.prisma.controlSchedule.findFirst({
      where: { id, tenantId },
      include: { template: { select: { id: true, name: true } } },
    });
    if (!schedule) throw new NotFoundException(`Schedule ${id} not found`);
    return toApiResponse(schedule);
  }

  // ── Create ───────────────────────────────────────────────────────────────────

  async create(dto: CreateScheduleDto, tenantId: string, createdBy: string) {
    // Validate template belongs to this tenant (or is system-level)
    const template = await this.prisma.controlTemplate.findFirst({
      where: {
        id: dto.templateId,
        OR: [{ tenantId }, { tenantId: null }],
      },
    });
    if (!template) {
      throw new BadRequestException(`Template ${dto.templateId} not found`);
    }

    // Validate recurrence config makes sense for the frequency
    this.validateRecurrenceForFrequency(dto.frequency, dto.recurrence);

    // Compute first nextRunAt so the generator picks this up immediately
    const nextRunAt = RecurrenceEngine.getNextOccurrence(
      dto.frequency,
      dto.recurrence as RecurrenceConfig,
      new Date(),
      dto.startDate,
      dto.endDate ?? null,
    );

    const schedule = await this.prisma.controlSchedule.create({
      data: {
        tenantId,
        templateId:     dto.templateId,
        zoneId:         dto.zoneId,
        assigneeId:     dto.assigneeId ?? null,
        groupId:        dto.groupId    ?? null,
        frequency:      dto.frequency,
        recurrenceJson: dto.recurrence as object,
        timezone:       dto.timezone,
        startDate:      dto.startDate,
        endDate:        dto.endDate ?? null,
        isActive:       true,
        nextRunAt,
        createdBy,
      },
      include: { template: { select: { id: true, name: true } } },
    });

    this.logger.log(
      `[Schedule create] id=${schedule.id} freq=${schedule.frequency} tenant=${tenantId} nextRun=${nextRunAt?.toISOString() ?? 'none'}`,
    );

    return toApiResponse(schedule, undefined, 'Schedule created successfully');
  }

  // ── Update ───────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateScheduleDto, tenantId: string) {
    const existing = await this.prisma.controlSchedule.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException(`Schedule ${id} not found`);

    // Re-compute nextRunAt if recurrence config changed
    let nextRunAt = existing.nextRunAt;
    if (dto.recurrence) {
      const merged: RecurrenceConfig = {
        ...(existing.recurrenceJson as RecurrenceConfig),
        ...dto.recurrence,
      };
      nextRunAt = RecurrenceEngine.getNextOccurrence(
        existing.frequency,
        merged,
        new Date(),
        existing.startDate,
        dto.endDate ?? existing.endDate ?? null,
      );
    }

    const updated = await this.prisma.controlSchedule.update({
      where: { id, tenantId },
      data: {
        ...(dto.isActive   !== undefined ? { isActive:   dto.isActive }   : {}),
        ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId, groupId: null } : {}),
        ...(dto.groupId    !== undefined ? { groupId:    dto.groupId,    assigneeId: null } : {}),
        ...(dto.endDate    !== undefined ? { endDate:    dto.endDate }    : {}),
        ...(dto.recurrence !== undefined
          ? {
              recurrenceJson: {
                ...(existing.recurrenceJson as object),
                ...dto.recurrence,
              },
              nextRunAt,
            }
          : {}),
      },
      include: { template: { select: { id: true, name: true } } },
    });

    return toApiResponse(updated, undefined, 'Schedule updated successfully');
  }

  // ── Deactivate (soft delete) ─────────────────────────────────────────────────

  async deactivate(id: string, tenantId: string) {
    const existing = await this.prisma.controlSchedule.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException(`Schedule ${id} not found`);

    await this.prisma.controlSchedule.update({
      where: { id, tenantId },
      data:  { isActive: false, nextRunAt: null },
    });

    return toApiResponse(null, undefined, 'Schedule deactivated successfully');
  }

  // ── Preview upcoming occurrences ─────────────────────────────────────────────

  async previewOccurrences(
    id:       string,
    tenantId: string,
    count    = 10,
  ) {
    const schedule = await this.prisma.controlSchedule.findFirst({
      where: { id, tenantId },
    });
    if (!schedule) throw new NotFoundException(`Schedule ${id} not found`);

    const config   = schedule.recurrenceJson as RecurrenceConfig;
    const now      = new Date();
    const horizon  = new Date(now.getTime() + 365 * 86_400_000); // 1 year lookahead
    const occs     = RecurrenceEngine.getOccurrencesInWindow(
      schedule.frequency,
      config,
      now,
      horizon,
      schedule.startDate,
      schedule.endDate ?? null,
    );

    return toApiResponse(occs.slice(0, count).map((d) => d.toISOString()));
  }

  // ── Validation helpers ───────────────────────────────────────────────────────

  private validateRecurrenceForFrequency(
    frequency: string,
    recurrence: { daysOfWeek?: number[]; daysOfMonth?: number[]; intervalUnit?: string },
  ): void {
    if (frequency === 'WEEKLY' && !recurrence.daysOfWeek?.length) {
      throw new BadRequestException(
        'daysOfWeek est requis pour les planifications hebdomadaires',
      );
    }
    if (frequency === 'MONTHLY' && !recurrence.daysOfMonth?.length) {
      throw new BadRequestException(
        'daysOfMonth est requis pour les planifications mensuelles',
      );
    }
    if (frequency === 'CUSTOM' && !recurrence.intervalUnit) {
      throw new BadRequestException(
        'intervalUnit (HOURS | DAYS | WEEKS) est requis pour les planifications personnalisées',
      );
    }
  }
}
