import { Injectable, NotFoundException } from '@nestjs/common';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateTemplateDto,
  UpdateTemplateDto,
  TemplateQuery,
  CreateTaskDto,
  UpdateTaskDto,
  TaskQuery,
} from './dto/control.dto';

@Injectable()
export class ControlService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Templates ─────────────────────────────────────────────────────────────

  async findAllTemplates(tenantId: string, query: TemplateQuery) {
    const { page, limit, search, type } = query;

    const where = {
      // Include system-level templates (tenantId = null) + tenant's own templates
      OR: [{ tenantId }, { tenantId: null }],
      ...(type ? { type: type as never } : {}),
      ...(search
        ? { name: { contains: search, mode: 'insensitive' as const } }
        : {}),
    };

    const [templates, total] = await Promise.all([
      this.prisma.controlTemplate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.controlTemplate.count({ where }),
    ]);

    return toApiResponse(templates, toPaginationMeta(total, page, limit));
  }

  async findOneTemplate(id: string, tenantId: string) {
    const template = await this.prisma.controlTemplate.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!template) throw new NotFoundException(`Modèle de contrôle ${id} introuvable`);
    return toApiResponse(template);
  }

  async createTemplate(dto: CreateTemplateDto, tenantId: string) {
    const template = await this.prisma.controlTemplate.create({
      data: {
        name:          dto.name,
        type:          dto.type,
        checklistJson: dto.checklistJson,
        frequency:     dto.frequency,
        tenantId,
      },
    });
    return toApiResponse(template, undefined, 'Modèle créé');
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto, tenantId: string) {
    const existing = await this.prisma.controlTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException(`Modèle de contrôle ${id} introuvable`);

    const template = await this.prisma.controlTemplate.update({
      where: { id },
      data: {
        ...(dto.name          !== undefined ? { name: dto.name }                   : {}),
        ...(dto.type          !== undefined ? { type: dto.type }                   : {}),
        ...(dto.checklistJson !== undefined ? { checklistJson: dto.checklistJson } : {}),
        ...(dto.frequency     !== undefined ? { frequency: dto.frequency }         : {}),
      },
    });
    return toApiResponse(template);
  }

  async deleteTemplate(id: string, tenantId: string) {
    const existing = await this.prisma.controlTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException(`Modèle de contrôle ${id} introuvable`);

    await this.prisma.controlTemplate.delete({ where: { id } });
    return toApiResponse(null, undefined, 'Modèle supprimé');
  }

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  async findAllTasks(tenantId: string, query: TaskQuery) {
    const { page, limit, status, assigneeId, from, to } = query;

    const where = {
      tenantId,
      ...(status     ? { status: status as never }   : {}),
      ...(assigneeId ? { assigneeId }                : {}),
      ...(from || to
        ? {
            scheduledAt: {
              ...(from ? { gte: from } : {}),
              ...(to   ? { lte: to }   : {}),
            },
          }
        : {}),
    };

    const [tasks, total] = await Promise.all([
      this.prisma.controlTask.findMany({
        where,
        orderBy: { scheduledAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          template: { select: { id: true, name: true, type: true } },
        },
      }),
      this.prisma.controlTask.count({ where }),
    ]);

    return toApiResponse(tasks, toPaginationMeta(total, page, limit));
  }

  async findOneTask(id: string, tenantId: string) {
    const task = await this.prisma.controlTask.findFirst({
      where: { id, tenantId },
      include: {
        template: { select: { id: true, name: true, type: true, checklistJson: true, frequency: true } },
      },
    });
    if (!task) throw new NotFoundException(`Tâche de contrôle ${id} introuvable`);
    return toApiResponse(task);
  }

  async createTask(dto: CreateTaskDto, tenantId: string) {
    // Verify the template is accessible for this tenant
    const template = await this.prisma.controlTemplate.findFirst({
      where: { id: dto.templateId, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!template) {
      throw new NotFoundException(`Modèle de contrôle ${dto.templateId} introuvable`);
    }

    const task = await this.prisma.controlTask.create({
      data: {
        templateId:  dto.templateId,
        zoneId:      dto.zoneId,
        assigneeId:  dto.assigneeId,
        tenantId,
        scheduledAt: dto.scheduledAt,
        status:      'PLANNED',
      },
      include: {
        template: { select: { id: true, name: true, type: true } },
      },
    });
    return toApiResponse(task, undefined, 'Tâche planifiée');
  }

  async updateTask(id: string, dto: UpdateTaskDto, tenantId: string) {
    const existing = await this.prisma.controlTask.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException(`Tâche de contrôle ${id} introuvable`);

    const task = await this.prisma.controlTask.update({
      where: { id },
      data: {
        ...(dto.status      !== undefined ? { status: dto.status }           : {}),
        ...(dto.notes       !== undefined ? { notes: dto.notes }             : {}),
        ...(dto.resultJson  !== undefined ? { resultJson: dto.resultJson as never } : {}),
        ...(dto.startedAt   !== undefined ? { startedAt: dto.startedAt }     : {}),
        ...(dto.completedAt !== undefined ? { completedAt: dto.completedAt } : {}),
      },
      include: {
        template: { select: { id: true, name: true, type: true } },
      },
    });
    return toApiResponse(task);
  }

  async getStats(tenantId: string) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const todayWhere = {
      tenantId,
      scheduledAt: { gte: startOfDay, lte: endOfDay },
    };

    const [todayTotal, todayCompleted, openOverdue] = await Promise.all([
      this.prisma.controlTask.count({ where: todayWhere }),
      this.prisma.controlTask.count({ where: { ...todayWhere, status: 'COMPLETED' } }),
      this.prisma.controlTask.count({ where: { tenantId, status: 'OVERDUE' } }),
    ]);

    // ARCH-DECISION: complianceRate is calculated over today's tasks only.
    // If no tasks are scheduled today, rate defaults to 100 (no violations).
    const complianceRate = todayTotal === 0
      ? 100
      : Math.round((todayCompleted / todayTotal) * 100);

    return toApiResponse({ todayTotal, todayCompleted, openOverdue, complianceRate });
  }
}
