import { z } from 'zod';

// ─── Product ──────────────────────────────────────────────────────────────────
export const ProductSchema = z.object({
  id: z.string().cuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  packaging: z.string().max(100).optional(),
  category: z.string().min(1).max(100),
  dlcDays: z.number().int().positive().optional(),
  tempStorage: z.number().optional(),
  supplierId: z.string().cuid().optional(),
  tenantId: z.string().cuid(),
  isActive: z.boolean().default(true),
  createdAt: z.coerce.date(),
});
export type Product = z.infer<typeof ProductSchema>;
export const CreateProductSchema = ProductSchema.omit({ id: true, tenantId: true, createdAt: true });
export type CreateProduct = z.infer<typeof CreateProductSchema>;

// ─── Equipment ────────────────────────────────────────────────────────────────
export const EquipmentSchema = z.object({
  id: z.string().cuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  type: z.string().max(100).optional(),
  serialNumber: z.string().max(100).optional(),
  brand: z.string().max(100).optional(),
  siteId: z.string().cuid().optional(),
  tempMin: z.number().optional(),
  tempMax: z.number().optional(),
  tenantId: z.string().cuid(),
  isActive: z.boolean().default(true),
  createdAt: z.coerce.date(),
});
export type Equipment = z.infer<typeof EquipmentSchema>;
export const CreateEquipmentSchema = EquipmentSchema.omit({ id: true, tenantId: true, createdAt: true });
export type CreateEquipment = z.infer<typeof CreateEquipmentSchema>;

// ─── Supplier ─────────────────────────────────────────────────────────────────
export const SupplierSchema = z.object({
  id: z.string().cuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  vat: z.string().max(50).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  address: z.string().max(500).optional(),
  tenantId: z.string().cuid(),
  isActive: z.boolean().default(true),
  createdAt: z.coerce.date(),
});
export type Supplier = z.infer<typeof SupplierSchema>;
export const CreateSupplierSchema = SupplierSchema.omit({ id: true, tenantId: true, createdAt: true });
export type CreateSupplier = z.infer<typeof CreateSupplierSchema>;
