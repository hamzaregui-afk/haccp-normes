import { z } from 'zod';

// ─── Action & Resource enums ────────────────────────────────────────────────
// Keep as const enums so the values are checked at runtime via Zod and at
// compile-time via TypeScript — single source of truth, no duplication.

export const AuditActionSchema = z.enum([
  'CREATE',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'EXPORT',
]);
export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditResourceSchema = z.enum([
  'users',
  'products',
  'controls',
  'nonconformities',
  'equipments',
  'suppliers',
  'groups',
  'reports',
]);
export type AuditResource = z.infer<typeof AuditResourceSchema>;

// ─── Create DTO ──────────────────────────────────────────────────────────────
// ARCH-DECISION: ipAddress is optional here because the controller injects it
// from request headers (X-Real-IP / x-forwarded-for) — callers do not supply it.
// It is present in this schema so the service method signature stays clean.

export const CreateAuditLogDtoSchema = z.object({
  userId:     z.string().min(1),
  action:     AuditActionSchema,
  resource:   z.string().min(1),
  resourceId: z.string().optional(),
  payload:    z.record(z.unknown()).optional(),
  ipAddress:  z.string().optional(),
});
export type CreateAuditLogDto = z.infer<typeof CreateAuditLogDtoSchema>;

// ─── Query DTO ───────────────────────────────────────────────────────────────
export const AuditQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(200).default(50),
  userId:   z.string().optional(),
  resource: z.string().optional(),
  action:   AuditActionSchema.optional(),
  from:     z.coerce.date().optional(),
  to:       z.coerce.date().optional(),
});
export type AuditQuery = z.infer<typeof AuditQuerySchema>;
