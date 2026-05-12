import { z } from 'zod';

// â”€â”€ Product â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const CreateProductSchema = z.object({
  name:        z.string().min(1).max(200),
  code:        z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  unit:        z.string().max(50).optional(),
  supplierId:  z.string().optional(),
});
export type CreateProductDto = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = CreateProductSchema.partial();
export type UpdateProductDto = z.infer<typeof UpdateProductSchema>;

// â”€â”€ Equipment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const CreateEquipmentSchema = z.object({
  name:            z.string().min(1).max(200),
  serialNumber:    z.string().max(100).optional(),
  location:        z.string().max(200).optional(),
  lastMaintained:  z.string().datetime().optional(),
  nextMaintenance: z.string().datetime().optional(),
});
export type CreateEquipmentDto = z.infer<typeof CreateEquipmentSchema>;

export const UpdateEquipmentSchema = CreateEquipmentSchema.partial();
export type UpdateEquipmentDto = z.infer<typeof UpdateEquipmentSchema>;

// â”€â”€ Supplier â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const CreateSupplierSchema = z.object({
  name:         z.string().min(1).max(200),
  code:         z.string().min(1).max(100),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(50).optional(),
  address:      z.string().max(500).optional(),
  tvaNumber:    z.string().max(50).optional(),
});
export type CreateSupplierDto = z.infer<typeof CreateSupplierSchema>;

export const UpdateSupplierSchema = CreateSupplierSchema.partial();
export type UpdateSupplierDto = z.infer<typeof UpdateSupplierSchema>;

// â”€â”€ Shared asset query â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const AssetQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(500).default(20),
  search: z.string().max(200).optional(),
});
export type AssetQuery = z.infer<typeof AssetQuerySchema>;
