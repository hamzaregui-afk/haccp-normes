import { z } from 'zod';

// ─── Control (CCP check / temperature log / checkpoint) ───────────────────────

export const ControlFrequencySchema = z.enum([
  'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'ON_RECEPTION', 'ON_DEMAND',
]);

export const ControlStatusSchema = z.enum([
  'PENDING',    // Scheduled but not yet performed
  'COMPLIANT',  // Measurement within critical limits
  'WARNING',    // Approaching critical limit
  'CRITICAL',   // Critical limit breached — corrective action required
  'SKIPPED',    // Intentionally skipped with justification
]);

export const ControlTypeSchema = z.enum([
  'TEMPERATURE', 'PH', 'WATER_ACTIVITY', 'VISUAL', 'WEIGHT', 'TIME', 'OTHER',
]);

export const ControlSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  ccpId: z.string().cuid(),            // References the CCP definition
  operatorId: z.string().cuid(),       // User who performed the check
  type: ControlTypeSchema,
  status: ControlStatusSchema,
  measuredValue: z.number().optional(), // null for visual / qualitative checks
  unit: z.string().max(20).optional(),
  criticalMin: z.number().optional(),
  criticalMax: z.number().optional(),
  notes: z.string().max(1000).optional(),
  performedAt: z.coerce.date(),
  createdAt: z.coerce.date(),
});

export type Control = z.infer<typeof ControlSchema>;

export const CreateControlSchema = ControlSchema.omit({
  id: true,
  tenantId: true,
  createdAt: true,
  status: true,  // Derived server-side by comparing measuredValue to criticalMin/Max
});

export type CreateControl = z.infer<typeof CreateControlSchema>;

// ─── CCP Definition ───────────────────────────────────────────────────────────

export const CcpSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: ControlTypeSchema,
  frequency: ControlFrequencySchema,
  criticalMin: z.number().optional(),
  criticalMax: z.number().optional(),
  unit: z.string().max(20).optional(),
  correctiveAction: z.string().max(2000),
  isActive: z.boolean().default(true),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Ccp = z.infer<typeof CcpSchema>;
