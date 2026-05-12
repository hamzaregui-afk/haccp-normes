import { z } from 'zod';

export const CreateSupplierDtoSchema = z.object({
  code:    z.string().min(1).max(50),
  name:    z.string().min(1).max(200),
  vat:     z.string().max(50).optional(),
  phone:   z.string().max(30).optional(),
  email:   z.string().email().optional().or(z.literal('')).transform(v => v || undefined),
  address: z.string().max(500).optional(),
});
export type CreateSupplierDto = z.infer<typeof CreateSupplierDtoSchema>;

export const UpdateSupplierDtoSchema = CreateSupplierDtoSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateSupplierDto = z.infer<typeof UpdateSupplierDtoSchema>;

export const SupplierQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  active: z.enum(['true','false']).optional(),
});
export type SupplierQuery = z.infer<typeof SupplierQuerySchema>;
