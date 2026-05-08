import { z } from 'zod';

export const CalculateDlcDtoSchema = z.object({
  productId:   z.string().min(1),
  productName: z.string().min(1).max(200),
  dlcDays:     z.coerce.number().int().positive(),
  producedAt:  z.coerce.date().default(() => new Date()),
});
export type CalculateDlcDto = z.infer<typeof CalculateDlcDtoSchema>;

export const PrintLabelDtoSchema = z.object({
  productId:   z.string().min(1),
  productName: z.string().min(1).max(200),
  // ARCH-DECISION: lotNumber is an optional HACCP traceability field (batch ID).
  // Required by food-safety regulations for full label traceability, but nullable
  // so that automated / API-only callers that don't track lots can still print labels.
  lotNumber:   z.string().max(100).optional(),
  dlcDays:     z.coerce.number().int().positive(),
  producedAt:  z.coerce.date().default(() => new Date()),
  expiresAt:   z.coerce.date().optional(), // If omitted, computed from producedAt + dlcDays
});
export type PrintLabelDto = z.infer<typeof PrintLabelDtoSchema>;

export const DlcQuerySchema = z.object({
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().positive().max(100).default(20),
  productId: z.string().optional(),
  printedBy: z.string().optional(),
  from:      z.coerce.date().optional(),
  to:        z.coerce.date().optional(),
});
export type DlcQuery = z.infer<typeof DlcQuerySchema>;
