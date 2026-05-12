import { z } from 'zod';

export const CreateNotificationDtoSchema = z.object({
  userId: z.string().min(1),
  type:   z.string().min(1).max(100),  // NC_CREATED | TASK_OVERDUE | REPORT_VALIDATED | …
  title:  z.string().min(1).max(200),
  body:   z.string().min(1).max(1000),
  link:   z.string().optional(),
});
export type CreateNotificationDto = z.infer<typeof CreateNotificationDtoSchema>;

export const NotificationQuerySchema = z.object({
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().positive().max(100).default(20),
  isRead: z.enum(['true', 'false']).optional(),
  userId: z.string().optional(),
});
export type NotificationQuery = z.infer<typeof NotificationQuerySchema>;

export const MarkReadDtoSchema = z.object({
  ids: z.array(z.string()).min(1),
});
export type MarkReadDto = z.infer<typeof MarkReadDtoSchema>;
