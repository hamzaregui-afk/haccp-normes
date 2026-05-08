import { z } from 'zod';

// ─── Nonconformity (écart) ────────────────────────────────────────────────────

export const NonconformitySeveritySchema = z.enum([
  'LOW',      // Observation — no immediate food safety risk
  'MEDIUM',   // Minor deviation — corrective action within 48h
  'HIGH',     // Major deviation — corrective action within 24h
  'CRITICAL', // Immediate food safety risk — stop production / withdraw product
]);

export const NonconformityStatusSchema = z.enum([
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
]);

export const NonconformityCategorySchema = z.enum([
  'TEMPERATURE',
  'HYGIENE',
  'LABELING',
  'TRACEABILITY',
  'EQUIPMENT',
  'SUPPLIER',
  'PROCESS',
  'OTHER',
]);

export const NonconformitySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  controlId: z.string().uuid().optional(), // Linked control that triggered this NC
  reportedById: z.string().uuid(),
  assignedToId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000),
  category: NonconformityCategorySchema,
  severity: NonconformitySeveritySchema,
  status: NonconformityStatusSchema.default('OPEN'),
  correctiveAction: z.string().max(5000).optional(),
  resolvedAt: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Nonconformity = z.infer<typeof NonconformitySchema>;

export const CreateNonconformitySchema = NonconformitySchema.omit({
  id: true,
  tenantId: true,
  status: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateNonconformity = z.infer<typeof CreateNonconformitySchema>;
