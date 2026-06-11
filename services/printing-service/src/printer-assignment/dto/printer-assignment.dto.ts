import { z } from 'zod';

// Local schemas (mirror shared-validators/src/printing.schema.ts). Reference ids
// use .min(1) (not .cuid()) per scripts/check-no-cuid-in-dtos.sh.

export const AssignmentScopeSchema = z.enum(['SITE', 'ZONE', 'USER', 'MODULE']);

export const CreatePrinterAssignmentSchema = z.object({
  printerId:   z.string().min(1),
  scope:       AssignmentScopeSchema,
  referenceId: z.string().min(1), // siteId | zoneId | userId | module key
  priority:    z.coerce.number().int().min(0).max(1000).default(0),
});
export type CreatePrinterAssignmentDto = z.infer<typeof CreatePrinterAssignmentSchema>;

export const UpdatePrinterAssignmentSchema = CreatePrinterAssignmentSchema.partial();
export type UpdatePrinterAssignmentDto = z.infer<typeof UpdatePrinterAssignmentSchema>;

export const PrinterAssignmentQuerySchema = z.object({
  page:        z.coerce.number().int().min(1).default(1),
  limit:       z.coerce.number().int().min(1).max(100).default(50),
  scope:       AssignmentScopeSchema.optional(),
  referenceId: z.string().min(1).optional(),
  printerId:   z.string().min(1).optional(),
});
export type PrinterAssignmentQuery = z.infer<typeof PrinterAssignmentQuerySchema>;

export const ResolvePrinterQuerySchema = z.object({
  module: z.string().min(1).optional(),
  siteId: z.string().min(1).optional(),
  zoneId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
});
export type ResolvePrinterQuery = z.infer<typeof ResolvePrinterQuerySchema>;
