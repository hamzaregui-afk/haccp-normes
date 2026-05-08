import { z } from 'zod';

export const ReportTypeSchema = z.enum([
  'MONTHLY_HYGIENE',
  'ANNUAL_HACCP',
  'TEMPERATURE_LOG',
]);
export type ReportType = z.infer<typeof ReportTypeSchema>;

export const ReportStatusSchema = z.enum([
  'PENDING',
  'UNDER_REVIEW',
  'VALIDATED',
  'SENT',
]);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

export const CreateReportSchema = z.object({
  type:   ReportTypeSchema,
  period: z
    .string()
    .regex(/^\d{4}(-\d{2})?$/, 'Format: YYYY or YYYY-MM')
    .optional(),
});
export type CreateReportDto = z.infer<typeof CreateReportSchema>;

export const UpdateReportStatusSchema = z.object({
  status: ReportStatusSchema,
});
export type UpdateReportStatusDto = z.infer<typeof UpdateReportStatusSchema>;

export const ReportQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  status: ReportStatusSchema.optional(),
  type:   ReportTypeSchema.optional(),
});
export type ReportQuery = z.infer<typeof ReportQuerySchema>;
