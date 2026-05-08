import { z } from 'zod';

// ─── Nonconformity (écart) ────────────────────────────────────────────────────

export const NonconformitySeveritySchema = z.enum([
  'LOW',      // Observation — no immediate food safety risk
  'MEDIUM',   // Minor deviation — corrective action within 48h
  'HIGH',     // Major deviation — corrective action within 24h
  'CRITICAL', // Immediate food safety risk — stop production / withdraw product
]);

// ARCH-DECISION: Must match the NCStatus Prisma enum in nonconformity-service exactly.
// Prior version had RESOLVED and CANCELLED which do not exist in the DB —
// removed RESOLVED (never in schema), renamed CANCELLED → REJECTED.
export const NonconformityStatusSchema = z.enum([
  'OPEN',
  'IN_PROGRESS',
  'CLOSED',
  'REJECTED',
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
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  controlId: z.string().cuid().optional(), // Linked control that triggered this NC
  reportedById: z.string().cuid(),
  assignedToId: z.string().cuid().optional(),
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
