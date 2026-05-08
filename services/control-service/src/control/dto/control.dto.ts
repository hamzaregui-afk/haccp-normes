import { z } from 'zod';

// ─── Enums (mirror Prisma enums — validated at API boundary) ──────────────────

export const ControlTypeSchema = z.enum([
  'RECEPTION',
  'TEMPERATURE_STOCK',
  'TEMPERATURE_DISPLAY',
  'TEMPERATURE_OIL',
  'EQUIPMENT',
  'SANITARY',
  'DAILY_PRODUCTION',
]);
export type ControlType = z.infer<typeof ControlTypeSchema>;

export const TaskStatusSchema = z.enum([
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'OVERDUE',
  'CANCELLED',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// ─── Template DTOs ────────────────────────────────────────────────────────────

export const CreateTemplateDtoSchema = z.object({
  name:         z.string().min(1).max(200),
  type:         ControlTypeSchema,
  checklistJson: z.array(z.unknown()),
  frequency:    z.string().max(50).optional(),
});
export type CreateTemplateDto = z.infer<typeof CreateTemplateDtoSchema>;

export const UpdateTemplateDtoSchema = CreateTemplateDtoSchema.partial();
export type UpdateTemplateDto = z.infer<typeof UpdateTemplateDtoSchema>;

// ─── Task DTOs ────────────────────────────────────────────────────────────────

export const CreateTaskDtoSchema = z.object({
  templateId:  z.string().cuid(),
  zoneId:      z.string().min(1),
  assigneeId:  z.string().min(1),
  scheduledAt: z.coerce.date(),
});
export type CreateTaskDto = z.infer<typeof CreateTaskDtoSchema>;

export const UpdateTaskDtoSchema = z.object({
  status:      TaskStatusSchema.optional(),
  notes:       z.string().max(2000).optional(),
  resultJson:  z.unknown().optional(),
  startedAt:   z.coerce.date().optional(),
  completedAt: z.coerce.date().optional(),
});
export type UpdateTaskDto = z.infer<typeof UpdateTaskDtoSchema>;

// ─── Query schemas ────────────────────────────────────────────────────────────

export const TemplateQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  type:   z.string().optional(),
});
export type TemplateQuery = z.infer<typeof TemplateQuerySchema>;

export const TaskQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).default(1),
  // max(500): dashboard chart queries fetch up to 200 tasks for 6-month compliance graphs
  limit:      z.coerce.number().int().min(1).max(500).default(20),
  status:     z.string().optional(),
  assigneeId: z.string().optional(),
  from:       z.coerce.date().optional(),
  to:         z.coerce.date().optional(),
});
export type TaskQuery = z.infer<typeof TaskQuerySchema>;
