import { z } from 'zod';

export const AuditActionSchema = z.enum([
  'user.created', 'user.updated', 'user.deleted',
  'nc.created', 'nc.updated', 'nc.closed',
  'control.task.completed', 'control.template.created',
  'report.generated', 'report.validated', 'report.sent',
  'asset.created', 'asset.updated', 'asset.deleted',
  'tenant.updated',
  'auth.login', 'auth.logout', 'auth.password_changed',
]);
export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditLogSchema = z.object({
  id:          z.string().cuid(),
  action:      z.string(),  // use string (not enum) so future actions don't break validation
  entityType:  z.string(),
  entityId:    z.string(),
  userId:      z.string(),
  userEmail:   z.string().email(),
  tenantId:    z.string().cuid(),
  ipAddress:   z.string().ip().optional().nullable(),
  metadata:    z.record(z.unknown()).optional(),
  createdAt:   z.string().datetime(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;
