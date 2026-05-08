import { z } from 'zod';

export const CalculateDLCSchema = z.object({
  productName:     z.string().min(1).max(200),
  lotNumber:       z.string().min(1).max(100),
  fabricationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD requis'),
  shelfLifeDays:   z.coerce.number().int().min(1).max(3650),
});
export type CalculateDLCDto = z.infer<typeof CalculateDLCSchema>;

// Creating a persisted DLC label has the same shape as the calculation input
export const CreateDLCLabelSchema = CalculateDLCSchema;
export type CreateDLCLabelDto = CalculateDLCDto;

export const DLCQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  days:  z.coerce.number().int().min(1).max(365).default(7),
});
export type DLCQuery = z.infer<typeof DLCQuerySchema>;
