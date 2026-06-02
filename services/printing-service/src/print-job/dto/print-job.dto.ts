import { z } from 'zod';

// ── Create ─────────────────────────────────────────────────────────────────────

export const CreatePrintJobSchema = z.object({
  /** Target printer ID. If omitted, the tenant's default printer is used. */
  printerId:  z.string().cuid().optional(),
  /** Template ID to render. If omitted, the default template for labelType is used. */
  templateId: z.string().cuid().optional(),
  /** Label category — must match a PrinterTemplate.labelType value. */
  labelType:  z.string().min(1).max(50),
  /**
   * Data used to render the template placeholders.
   * For DLC labels this includes: productName, producedAt, expiresAt, lotNumber, etc.
   */
  payload: z.record(z.unknown()),
  /** Number of copies to print. Defaults to 1. */
  copies: z.coerce.number().int().min(1).max(99).default(1),
});

export type CreatePrintJobDto = z.infer<typeof CreatePrintJobSchema>;

// ── Query ──────────────────────────────────────────────────────────────────────

export const PrintJobStatusSchema = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']);
export type PrintJobStatusType = z.infer<typeof PrintJobStatusSchema>;

export const PrintJobQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
  status:    PrintJobStatusSchema.optional(),
  labelType: z.string().optional(),
});

export type PrintJobQuery = z.infer<typeof PrintJobQuerySchema>;
