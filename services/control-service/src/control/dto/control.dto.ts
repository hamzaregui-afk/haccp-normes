import { z } from 'zod';

// ─── Enums (mirror Prisma enums — validated at API boundary) ──────────────────

export const TaskStatusSchema = z.enum([
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'OVERDUE',
  'CANCELLED',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// ─── Task result schemas ───────────────────────────────────────────────────────

export const TaskResultItemSchema = z.object({
  id:           z.string(),
  label:        z.string(),
  type:         z.enum(['BOOLEAN', 'NUMBER', 'TEXT', 'TEMPERATURE', 'PHOTO', 'SIGNATURE', 'DATE', 'SELECT']),
  value:        z.union([z.boolean(), z.number(), z.string(), z.null()]),
  unit:         z.string().optional(),
  min:          z.number().optional(),
  max:          z.number().optional(),
  compliant:    z.boolean(),
  required:     z.boolean(),
  // ARCH-DECISION: measuredTemp stores the operator's raw temperature reading
  // (the "Valeur relevée" field shown on every checklist item). It is recorded
  // alongside the structured value so reports can reconstruct the exact ambient/
  // product temperature at the time of the control — required for HACCP traceability.
  measuredTemp: z.string().optional(),
});

export const TaskResultSchema = z.object({
  submittedAt:      z.string(),
  submittedBy:      z.string(),
  overallCompliant: z.boolean(),
  notes:            z.string().optional(),
  ncComment:        z.string().optional(),
  ncPhoto:          z.string().optional(),
  items:            z.array(TaskResultItemSchema),
});
export type TaskResult = z.infer<typeof TaskResultSchema>;

// ─── Template DTOs ────────────────────────────────────────────────────────────

export const CreateTemplateDtoSchema = z.object({
  name:          z.string().min(1).max(200),
  checklistJson: z.array(z.unknown()),
  frequency:     z.string().max(50).optional(),
});
export type CreateTemplateDto = z.infer<typeof CreateTemplateDtoSchema>;

export const UpdateTemplateDtoSchema = CreateTemplateDtoSchema.partial();
export type UpdateTemplateDto = z.infer<typeof UpdateTemplateDtoSchema>;

// ─── Task DTOs ────────────────────────────────────────────────────────────────

export const CreateTaskDtoSchema = z.object({
  templateId:  z.string().min(1),
  zoneId:      z.string().min(1),
  assigneeId:  z.string().min(1).optional(),
  groupId:     z.string().min(1).optional(),
  scheduledAt: z.coerce.date(),
}).refine((d) => d.assigneeId ?? d.groupId, {
  message: 'assigneeId ou groupId est requis',
  path: ['assigneeId'],
});
export type CreateTaskDto = z.infer<typeof CreateTaskDtoSchema>;

// Valid status transitions (enforced additionally in service)
// ARCH-DECISION: PLANNED and OVERDUE allow direct → COMPLETED to eliminate
// the two-step race condition (startMutation fire-and-forget + completeMutation).
// When a task is submitted directly from PLANNED/OVERDUE, the service auto-sets
// startedAt = completedAt = now so HACCP audit trails remain complete.
export const VALID_TRANSITIONS: Record<string, readonly string[]> = {
  PLANNED:     ['IN_PROGRESS', 'CANCELLED', 'OVERDUE', 'COMPLETED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  OVERDUE:     ['IN_PROGRESS', 'CANCELLED', 'COMPLETED'],
  COMPLETED:   [],
  CANCELLED:   [],
} as const;

export const UpdateTaskDtoSchema = z
  .object({
    status:      TaskStatusSchema.optional(),
    assigneeId:  z.string().min(1).optional(),
    groupId:     z.string().min(1).optional(),
    notes:       z.string().max(2000).optional(),
    resultJson:  TaskResultSchema.optional(),
    startedAt:   z.coerce.date().optional(),
    completedAt: z.coerce.date().optional(),
  })
  .refine((d) => !(d.assigneeId && d.groupId), {
    message: 'assigneeId et groupId sont mutuellement exclusifs',
    path: ['assigneeId'],
  })
  .refine(
    (d) => !(d.status === 'COMPLETED' && !d.resultJson),
    { message: 'resultJson est requis pour valider un contrôle', path: ['resultJson'] }
  );
export type UpdateTaskDto = z.infer<typeof UpdateTaskDtoSchema>;

// ─── Query schemas ────────────────────────────────────────────────────────────

export const TemplateQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
});
export type TemplateQuery = z.infer<typeof TemplateQuerySchema>;

export const TaskQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).default(1),
  // max(500): dashboard chart queries fetch up to 200 tasks for 6-month compliance graphs
  limit:      z.coerce.number().int().min(1).max(500).default(20),
  status:     z.string().optional(),
  assigneeId: z.string().optional(),
  zoneId:     z.string().optional(),
  templateId: z.string().optional(),
  from:       z.coerce.date().optional(),
  to:         z.coerce.date().optional(),
});
export type TaskQuery = z.infer<typeof TaskQuerySchema>;
