import { z } from 'zod';

// ARCH-DECISION: Field names mirror the Prisma DlcLabel model exactly.
// Prior version used fabricationDate/expirationDate/shelfLifeDays which do
// not exist in the DB schema — kept alive only in the shared package and
// caused silent 400 errors when used as API payloads.

export const DLCLabelSchema = z.object({
  id:          z.string().cuid(),
  tenantId:    z.string(),
  productId:   z.string(),
  productName: z.string().min(1).max(200),
  lotNumber:   z.string().max(100).nullish(), // optional HACCP batch ID
  producedAt:  z.coerce.date(),              // was fabricationDate
  expiresAt:   z.coerce.date(),              // was expirationDate
  printedBy:   z.string(),
  printedAt:   z.coerce.date(),              // was createdAt
});
export type DLCLabel = z.infer<typeof DLCLabelSchema>;

export const CalculateDLCSchema = z.object({
  productId:   z.string().min(1),
  productName: z.string().min(1).max(200),
  lotNumber:   z.string().max(100).optional(), // optional HACCP batch ID
  dlcDays:     z.coerce.number().int().positive().max(3650), // was shelfLifeDays
  producedAt:  z.coerce.date().default(() => new Date()),    // was fabricationDate
});
export type CalculateDLCDto = z.infer<typeof CalculateDLCSchema>;

export const DLCCalculationResultSchema = z.object({
  productId:   z.string(),
  productName: z.string(),
  dlcDays:     z.number().int().positive(),
  producedAt:  z.coerce.date(),
  expiresAt:   z.coerce.date(), // was expirationDate
});
export type DLCCalculationResult = z.infer<typeof DLCCalculationResultSchema>;
