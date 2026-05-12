import { z } from 'zod';

// HTML inputs submit "" when blank — treat as undefined so optional fields behave correctly
const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

// Base object without the refine — needed so .partial() can be called for update
const EquipmentBaseSchema = z.object({
  code:         z.string().min(1).max(50),
  name:         z.string().min(1).max(200),
  type:         z.preprocess(emptyToUndefined, z.string().max(100).optional()),
  serialNumber: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
  brand:        z.preprocess(emptyToUndefined, z.string().max(100).optional()),
  // Empty string from an unselected <select> must not fail .cuid()
  siteId:       z.preprocess(emptyToUndefined, z.string().cuid().optional()),
  // Empty number inputs coerce "" → 0, triggering the tempMin < tempMax refine falsely
  tempMin:      z.preprocess(emptyToUndefined, z.coerce.number().optional()),
  tempMax:      z.preprocess(emptyToUndefined, z.coerce.number().optional()),
});

export const CreateEquipmentDtoSchema = EquipmentBaseSchema.refine(
  (d) => {
    if (d.tempMin !== undefined && d.tempMax !== undefined) return d.tempMin < d.tempMax;
    return true;
  },
  { message: 'tempMin doit être inférieur à tempMax', path: ['tempMin'] },
);
export type CreateEquipmentDto = z.infer<typeof CreateEquipmentDtoSchema>;

// ARCH-DECISION: .partial() must be called on the base ZodObject (not on ZodEffects
// produced by .refine()), because ZodEffects doesn't expose .partial().
export const UpdateEquipmentDtoSchema = EquipmentBaseSchema.partial().extend({
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
