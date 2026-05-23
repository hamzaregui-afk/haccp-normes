import { z } from 'zod';

// ─── Frequency & Config ────────────────────────────────────────────────────────

export const ScheduleFrequencySchema = z.enum([
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'YEARLY',
  'CUSTOM',
]);
export type ScheduleFrequency = z.infer<typeof ScheduleFrequencySchema>;

/** HH:mm in UTC (or in schedule.timezone, converted before storage) */
const TimeSlotSchema = z.string().regex(
  /^([01]\d|2[0-3]):[0-5]\d$/,
  'timeSlot must be HH:mm (00:00–23:59)',
);

export const RecurrenceConfigSchema = z.object({
  /** Every N days / weeks / months (default: 1) */
  interval:            z.number().int().min(1).default(1),
  /** Days of week for WEEKLY schedules: 0=Sun, 1=Mon, …, 6=Sat */
  daysOfWeek:          z.array(z.number().int().min(0).max(6)).optional(),
  /** Days of month for MONTHLY schedules: 1–31 (clamped to last day when month is shorter) */
  daysOfMonth:         z.array(z.number().int().min(1).max(31)).optional(),
  /** At least one time slot in HH:mm (UTC). For CUSTOM/HOURS intervals this is ignored. */
  timeSlots:           z.array(TimeSlotSchema).min(1).max(12),
  /** How many days ahead to pre-generate tasks (default: 7) */
  advanceGenerateDays: z.number().int().min(1).max(90).default(7),
  /** For CUSTOM frequency: unit of the interval */
  intervalUnit:        z.enum(['HOURS', 'DAYS', 'WEEKS']).optional(),
});
export type RecurrenceConfig = z.infer<typeof RecurrenceConfigSchema>;

// ─── CRUD DTOs ─────────────────────────────────────────────────────────────────

export const CreateScheduleDtoSchema = z
  .object({
    templateId:  z.string().min(1),
    zoneId:      z.string().min(1),
    assigneeId:  z.string().min(1).optional(),
    groupId:     z.string().min(1).optional(),
    frequency:   ScheduleFrequencySchema,
    recurrence:  RecurrenceConfigSchema,
    timezone:    z.string().default('UTC'),
    startDate:   z.coerce.date(),
    endDate:     z.coerce.date().optional(),
  })
  .refine((d) => d.assigneeId ?? d.groupId, {
    message: 'assigneeId ou groupId est requis',
    path: ['assigneeId'],
  })
  .refine(
    (d) => !(d.assigneeId && d.groupId),
    { message: 'assigneeId et groupId sont mutuellement exclusifs', path: ['assigneeId'] },
  );
export type CreateScheduleDto = z.infer<typeof CreateScheduleDtoSchema>;

export const UpdateScheduleDtoSchema = z
  .object({
    isActive:   z.boolean().optional(),
    assigneeId: z.string().min(1).optional(),
    groupId:    z.string().min(1).optional(),
    endDate:    z.coerce.date().optional(),
    recurrence: RecurrenceConfigSchema.partial().optional(),
  })
  .refine(
    (d) => !(d.assigneeId && d.groupId),
    { message: 'assigneeId et groupId sont mutuellement exclusifs', path: ['assigneeId'] },
  );
export type UpdateScheduleDto = z.infer<typeof UpdateScheduleDtoSchema>;

export const ScheduleQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
  templateId: z.string().optional(),
  isActive:   z.preprocess(
    (v) => (v === 'true' ? true : v === 'false' ? false : v),
    z.boolean().optional(),
  ),
});
export type ScheduleQuery = z.infer<typeof ScheduleQuerySchema>;
