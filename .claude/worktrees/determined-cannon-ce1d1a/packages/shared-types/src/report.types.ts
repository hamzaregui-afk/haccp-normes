import { z } from 'zod';

export const ReportTypeSchema = z.enum(['MONTHLY_HYGIENE', 'ANNUAL_HACCP', 'TEMPERATURE_LOG']);
export type ReportType = z.infer<typeof ReportTypeSchema>;

export const ReportStatusSchema = z.enum(['PENDING', 'UNDER_REVIEW', 'VALIDATED', 'SENT']);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

export const ReportSchema = z.object({
  id:          z.string().cuid(),
  type:        ReportTypeSchema,
  status:      ReportStatusSchema,
  tenantId:    z.string().cuid(),
  fileUrl:     z.string().url().optional().nullable(),
  validatedBy: z.string().optional().nullable(),
  generatedAt: z.string().datetime(),
  validatedAt: z.string().datetime().optional().nullable(),
  sentAt:      z.string().datetime().optional().nullable(),
  createdAt:   z.string().datetime(),
});
export type Report = z.infer<typeof ReportSchema>;

export const CreateReportSchema = z.object({
  type:   ReportTypeSchema,
  period: z.string().optional(),
});
export type CreateReportDto = z.infer<typeof CreateReportSchema>;
