import { z } from 'zod';

export const DLCLabelSchema = z.object({
  id:              z.string().uuid(),
  tenantId:        z.string().uuid(),
  productName:     z.string().min(1).max(200),
  lotNumber:       z.string().min(1).max(100),
  fabricationDate: z.string().datetime(),
  expirationDate:  z.string().datetime(),
  shelfLifeDays:   z.number().int().positive(),
  printedBy:       z.string().optional().nullable(),
  printedAt:       z.string().datetime().optional().nullable(),
  createdAt:       z.string().datetime(),
});
export type DLCLabel = z.infer<typeof DLCLabelSchema>;

export const CalculateDLCSchema = z.object({
  productName:     z.string().min(1).max(200),
  lotNumber:       z.string().min(1).max(100),
  fabricationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD requis'),
  shelfLifeDays:   z.coerce.number().int().positive().max(3650),
});
export type CalculateDLCDto = z.infer<typeof CalculateDLCSchema>;

export const DLCCalculationResultSchema = z.object({
  expirationDate: z.string().datetime(),
  label: DLCLabelSchema.pick({
    productName: true,
    lotNumber: true,
    fabricationDate: true,
    expirationDate: true,
    shelfLifeDays: true,
  }),
});
export type DLCCalculationResult = z.infer<typeof DLCCalculationResultSchema>;
