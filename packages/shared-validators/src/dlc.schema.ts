import { z } from 'zod';

// ARCH-DECISION: Field names mirror PrintLabelDtoSchema in dlc-service/src/dlc/dto/dlc.dto.ts.
// Prior version used fabricationDate/shelfLifeDays which do not exist in the
// backend DTO â€” any service importing these schemas would produce 400 errors.

export const CalculateDLCSchema = z.object({
  productId:   z.string().min(1),
  productName: z.string().min(1).max(200),
  lotNumber:   z.string().max(100).optional(), // optional HACCP batch ID
  dlcDays:     z.coerce.number().int().min(1).max(3650), // was shelfLifeDays
  producedAt:  z.coerce.date().default(() => new Date()), // was fabricationDate (YYYY-MM-DD string)
});
export type CalculateDLCDto = z.infer<typeof CalculateDLCSchema>;

// Creating a persisted DLC label uses the same payload shape as calculation
export const CreateDLCLabelSchema = CalculateDLCSchema;
export type CreateDLCLabelDto = CalculateDLCDto;

export const DLCQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  days:  z.coerce.number().int().min(1).max(365).default(7),
});
export type DLCQuery = z.infer<typeof DLCQuerySchema>;
