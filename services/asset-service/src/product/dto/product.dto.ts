import { z } from 'zod';

// Helper: HTML number inputs submit empty string when blank — treat as undefined
const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

export const CreateProductDtoSchema = z.object({
  code:        z.string().min(1).max(50),
  name:        z.string().min(1).max(200),
  category:    z.string().min(1).max(100),
  packaging:   z.preprocess(emptyToUndefined, z.string().max(100).optional()),
  dlcDays:     z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  tempStorage: z.preprocess(emptyToUndefined, z.coerce.number().optional()),
  // Empty string from an unselected <select> must map to undefined, not fail validation
  supplierId:  z.preprocess(emptyToUndefined, z.string().min(1).optional()),
});
export type CreateProductDto = z.infer<typeof CreateProductDtoSchema>;

export const UpdateProductDtoSchema = CreateProductDtoSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateProductDto = z.infer<typeof UpdateProductDtoSchema>;

export const ProductQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(500).default(20),
  search:     z.string().max(200).optional(),
  category:   z.string().optional(),
  supplierId: z.string().optional(),
  active:     z.enum(['true', 'false']).optional(),
});
export type ProductQuery = z.infer<typeof ProductQuerySchema>;
