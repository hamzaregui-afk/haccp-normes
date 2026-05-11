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

// ARCH-DECISION: AuditLog fields mirror the audit-service Prisma schema exactly.
// Previous version used entityType/entityId/userEmail/metadata which did NOT exist
// in the DB — this caused AuditPage to maintain a local duplicate type.
// These names are now consistent: resource (table name), resourceId (PK).
export const AuditLogSchema = z.object({
  id:         z.string().cuid(),
  action:     z.string(),           // CREATE | UPDATE | DELETE | LOGIN | LOGOUT
  resource:   z.string(),           // resource name: users | products | controls …
  resourceId: z.string().nullable().optional(),
  userId:     z.string(),
  tenantId:   z.string(),
  payload:    z.record(z.unknown()).nullable().optional(),
  ipAddress:  z.string().nullable().optional(),
  createdAt:  z.string().datetime(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;
