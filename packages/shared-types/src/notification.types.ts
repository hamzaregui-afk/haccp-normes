import { z } from 'zod';

export const NotificationTypeSchema = z.enum([
  'NC_CREATED',
  'CONTROL_COMPLETED',
  'REPORT_VALIDATED',
  'DLC_EXPIRING',
  'SYSTEM',
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationSchema = z.object({
  id:        z.string().uuid(),
  userId:    z.string().uuid(),
  tenantId:  z.string().uuid(),
  type:      NotificationTypeSchema,
  title:     z.string(),
  body:      z.string(),
  isRead:    z.boolean().default(false),
  metadata:  z.record(z.unknown()).optional(),
  createdAt: z.string().datetime(),
});
export type Notification = z.infer<typeof NotificationSchema>;
