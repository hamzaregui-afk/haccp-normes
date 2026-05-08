import { z } from 'zod';

export const CreateEquipmentDtoSchema = z.object({
  code:         z.string().min(1).max(50),
  name:         z.string().min(1).max(200),
  type:         z.string().max(100).optional(),
  serialNumber: z.string().max(100).optional(),
  brand:        z.string().max(100).optional(),
  siteId:       z.string().cuid().optional(),
  tempMin:      z.coerce.number().optional(),
  tempMax:      z.coerce.number().optional(),
}).refine(
  (d) => {
    if (d.tempMin !== undefined && d.tempMax !== undefined) return d.tempMin < d.tempMax;
    return true;
  },
  { message: 'tempMin doit être inférieur à tempMax', path: ['tempMin'] },
);
export type CreateEquipmentDto = z.infer<typeof CreateEquipmentDtoSchema>;

export const UpdateEquipmentDtoSchema = CreateEquipmentDtoSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateEquipmentDto = z.infer<typeof UpdateEquipmentDtoSchema>;

export const EquipmentQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  type:   z.string().optional(),
  siteId: z.string().optional(),
  active: z.enum(['true', 'false']).optional(),
});
export type EquipmentQuery = z.infer<typeof EquipmentQuerySchema>;
