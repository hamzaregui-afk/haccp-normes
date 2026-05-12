import { z } from 'zod';

// ─── ReportStatus ─────────────────────────────────────────────────────────────

export const ReportStatusSchema = z.enum([
  'PENDING',
  'UNDER_REVIEW',
  'VALIDATED',
  'SENT',
]);

export type ReportStatus = z.infer<typeof ReportStatusSchema>;

// ─── Create ───────────────────────────────────────────────────────────────────

export const CreateReportDtoSchema = z.object({
  /** Report type identifier, e.g. 'MONTHLY_HYGIENE', 'ANNUAL_HACCP', 'TEMPERATURE_LOG' */
  type:   z.string().min(1),
  /** Optional reporting period, e.g. '2025-01' */
  period: z.string().optional(),
});

export type CreateReportDto = z.infer<typeof CreateReportDtoSchema>;

// ─── Update ───────────────────────────────────────────────────────────────────

export const UpdateReportDtoSchema = z.object({
  status:  ReportStatusSchema.optional(),
  fileUrl: z.string().url().optional(),
});

export type UpdateReportDto = z.infer<typeof UpdateReportDtoSchema>;

// ─── Query ────────────────────────────────────────────────────────────────────

export const ReportQuerySchema = z.object({
  page:   z.coerce.number().min(1).default(1),
  limit:  z.coerce.number().min(1).max(100).default(20),
  status: z.string().optional(),
  type:   z.string().optional(),
});

export type ReportQuery = z.infer<typeof ReportQuerySchema>;
