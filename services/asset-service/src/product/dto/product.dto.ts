import { z } from 'zod';

export const CreateProductDtoSchema = z.object({
  code:        z.string().min(1).max(50),
  name:        z.string().min(1).max(200),
  category:    z.string().min(1).max(100),
  packaging:   z.string().max(100).optional(),
  dlcDays:     z.coerce.number().int().positive().optional(),
  tempStorage: z.coerce.number().optional(),
  supplierId:  z.string().cuid().optional(),
});
export type CreateProductDto = z.infer<typeof CreateProductDtoSchema>;

export const UpdateProductDtoSchema = CreateProductDtoSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateProductDto = z.infer<typeof UpdateProductDtoSchema>;

export const ProductQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
  search:     z.string().max(200).optional(),
  category:   z.string().optional(),
  supplierId: z.string().optional(),
  active:     z.enum(['true', 'false']).optional(),
});
export type ProductQuery = z.infer<typeof ProductQuerySchema>;
