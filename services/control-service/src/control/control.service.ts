import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import {
  VALID_TRANSITIONS,
  type CreateTemplateDto,
  type UpdateTemplateDto,
  type TemplateQuery,
  type CreateTaskDto,
  type UpdateTaskDto,
  type TaskQuery,
} from './dto/control.dto';

// ARCH-DECISION: publishDomainEvent is intentionally NOT imported here.
// Domain events are now written to the outbox_events table in the same DB
// transaction as the business entity. The OutboxWorker polls and publishes
// them to RabbitMQ — guaranteeing at-least-once delivery even on crash.
// See src/outbox/outbox.worker.ts for the relay implementation.

@Injectable()
export class ControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
  ) {}

  // ─── Templates ─────────────────────────────────────────────────────────────

  async findAllTemplates(tenantId: string, query: TemplateQuery) {
    const { page, limit, search } = query;

    const where = {
      // Include system-level templates (tenantId = null) + tenant's own templates
      OR: [{ tenantId }, { tenantId: null }],
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

    return toApiResponse(templates, toPaginationMeta(total, { page, limit }));
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
        checklistJson: dto.checklistJson as Prisma.InputJsonValue,
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
      // tenantId in where is defence-in-depth: the findFirst above already verified ownership,
      // but this ensures a TOCTOU window between the two queries cannot affect a different tenant.
      where: { id, tenantId },
      data: {
        ...(dto.name          !== undefined ? { name: dto.name }                                           : {}),
        ...(dto.checklistJson !== undefined ? { checklistJson: dto.checklistJson as Prisma.InputJsonValue } : {}),
        ...(dto.frequency     !== undefined ? { frequency: dto.frequency }                                 : {}),
      },
    });
    return toApiResponse(template);
  }

  async deleteTemplate(id: string, tenantId: string) {
    const existing = await this.prisma.controlTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException(`Modèle de contrôle ${id} introuvable`);

    await this.prisma.controlTemplate.delete({ where: { id, tenantId } });
    return toApiResponse(null, undefined, 'Modèle supprimé');
  }

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  async findAllTasks(tenantId: string, query: TaskQuery) {
    const { page, limit, status, assigneeId, zoneId, templateId, from, to } = query;

    const where = {
      tenantId,
      ...(status     ? { status: status as never }   : {}),
      ...(assigneeId ? { assigneeId }                : {}),
      ...(zoneId     ? { zoneId }                    : {}),
      ...(templateId ? { templateId }                : {}),
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

    return toApiResponse(tasks, toPaginationMeta(total, { page, limit }));
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

  async createTask(dto: CreateTaskDto, tenantId: string, correlationId?: string) {
    const template = await this.prisma.controlTemplate.findFirst({
      where: { id: dto.templateId, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!template) {
      throw new NotFoundException(`Modèle de contrôle ${dto.templateId} introuvable`);
    }

    const targetId = dto.assigneeId ?? dto.groupId;

    // ARCH-DECISION: $transaction guarantees that the task row and the outbox_event
    // row are either both committed or both rolled back. This eliminates the dual-write
    // race condition where the service crashes after saving the task but before publishing.
    const [task] = await this.prisma.$transaction([
      this.prisma.controlTask.create({
        data: {
          templateId:        dto.templateId,
          zoneId:            dto.zoneId,
          assigneeId:        dto.assigneeId ?? null,
          groupId:           dto.groupId    ?? null,
          tenantId,
          scheduledAt:       dto.scheduledAt,
          status:            TaskStatus.PLANNED,
          // ARCH-DECISION: checklistSnapshot freezes the checklist definition at task creation.
          // Inspectors must see exactly what questions were asked, even if the template changes.
          checklistSnapshot: template.checklistJson as Prisma.InputJsonValue,
        },
        include: {
          template: { select: { id: true, name: true, type: true } },
        },
      }),
      // Outbox event — published to RabbitMQ by OutboxWorker (every 5 s)
      ...(targetId
        ? [
            this.prisma.outboxEvent.create({
              data: {
                eventType:     'control.task.assigned.v1',
                tenantId,
                correlationId: correlationId ?? null,
                payload: {
                  assigneeId:   dto.assigneeId ?? null,
                  groupId:      dto.groupId    ?? null,
                  templateName: template.name,
                  scheduledAt:  dto.scheduledAt.toISOString(),
                },
              },
            }),
          ]
        : []),
    ]);

    return toApiResponse(task, undefined, 'Tâche planifiée');
  }

  async updateTask(id: string, dto: UpdateTaskDto, tenantId: string, correlationId?: string) {
    const existing = await this.prisma.controlTask.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException(`Tâche de contrôle ${id} introuvable`);

    // Status transition guard
    if (dto.status && existing.status !== dto.status) {
      const allowed = VALID_TRANSITIONS[existing.status] ?? [];
      if (!(allowed as readonly string[]).includes(dto.status)) {
        throw new BadRequestException(
          `Transition invalide: ${existing.status} → ${dto.status}`,
        );
      }
    }

    const isCompleting = dto.status === TaskStatus.COMPLETED && existing.status !== TaskStatus.COMPLETED;

    // Atomically update task + write outbox event for significant transitions
    const [task] = await this.prisma.$transaction([
      this.prisma.controlTask.update({
        where: { id, tenantId },
        data: {
          ...(dto.status      !== undefined ? { status: dto.status }                     : {}),
          ...(dto.assigneeId  !== undefined ? { assigneeId: dto.assigneeId, groupId: null } : {}),
          ...(dto.groupId     !== undefined ? { groupId: dto.groupId, assigneeId: null }    : {}),
          ...(dto.notes       !== undefined ? { notes: dto.notes }                       : {}),
          ...(dto.resultJson  !== undefined ? { resultJson: dto.resultJson as never }    : {}),
          ...(dto.startedAt   !== undefined ? { startedAt: dto.startedAt }               : {}),
          ...(dto.completedAt !== undefined ? { completedAt: dto.completedAt }           : {}),
        },
        include: {
          template: { select: { id: true, name: true, type: true } },
        },
      }),
      // Outbox: publish task.completed.v1 on COMPLETED transition
      ...(isCompleting
        ? [
            this.prisma.outboxEvent.create({
              data: {
                eventType:     'control.task.completed.v1',
                tenantId,
                correlationId: correlationId ?? null,
                payload: {
                  taskId:      id,
                  zoneId:      existing.zoneId,
                  assigneeId:  existing.assigneeId,
                  completedAt: dto.completedAt?.toISOString() ?? new Date().toISOString(),
                },
              },
            }),
          ]
        : []),
    ]);

    return toApiResponse(task);
  }

  async getStats(tenantId: string) {
    const now        = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const todayWhere = {
      tenantId,
      scheduledAt: { gte: startOfDay, lte: endOfDay },
    };

    const [todayTotal, todayCompleted, openOverdue] = await Promise.all([
      this.prisma.controlTask.count({ where: todayWhere }),
      this.prisma.controlTask.count({ where: { ...todayWhere, status: TaskStatus.COMPLETED } }),
      this.prisma.controlTask.count({ where: { tenantId, status: TaskStatus.OVERDUE } }),
    ]);

    // ARCH-DECISION: complianceRate is calculated over today's tasks only.
    // If no tasks are scheduled today, rate defaults to 100 (no violations).
    const complianceRate = todayTotal === 0
      ? 100
      : Math.round((todayCompleted / todayTotal) * 100);

    return toApiResponse({ todayTotal, todayCompleted, openOverdue, complianceRate });
  }

  // ─── Photos ────────────────────────────────────────────────────────────────

  async addPhoto(taskId: string, tenantId: string, file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu');
    }
    const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException(
        `Type de fichier non autorisé: ${file.mimetype}. Types acceptés: JPEG, PNG, WEBP, GIF`,
      );
    }

    const existing = await this.prisma.controlTask.findFirst({ where: { id: taskId, tenantId } });
    if (!existing) throw new NotFoundException(`Tâche de contrôle ${taskId} introuvable`);

    const objectKey = await this.minio.upload(file.buffer, file.originalname, file.mimetype, tenantId, taskId);
    const url       = await this.minio.presignedGetUrl(objectKey);

    const photo = await this.prisma.controlPhoto.create({
      data: { taskId, tenantId, objectKey, url },
    });

    return toApiResponse({ ...photo, url }, undefined, 'Photo ajoutée');
  }

  async getPhotos(taskId: string, tenantId: string) {
    const existing = await this.prisma.controlTask.findFirst({ where: { id: taskId, tenantId } });
    if (!existing) throw new NotFoundException(`Tâche de contrôle ${taskId} introuvable`);

    const photos = await this.prisma.controlPhoto.findMany({
      where: { taskId, tenantId },
      orderBy: { uploadedAt: 'asc' },
    });

    // Refresh presigned URLs (they expire after 1 h) — never store permanent URLs
    const withUrls = await Promise.all(
      photos.map(async (p) => ({ ...p, url: await this.minio.presignedGetUrl(p.objectKey) })),
    );

    return toApiResponse(withUrls);
  }
}
