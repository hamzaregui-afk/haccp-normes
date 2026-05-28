import { z } from 'zod';

// ── Tracability record ────────────────────────────────────────────────────────

export const TracabilityStatusSchema = z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
export type TracabilityStatus = z.infer<typeof TracabilityStatusSchema>;

export const TracabilityTypeSchema = z.enum([
  'RECEPTION',     // Réception matière première
  'PRODUCTION',    // Production / transformation
  'EXPEDITION',    // Expédition / livraison
  'INTERNAL',      // Mouvement interne
  'DESTRUCTION',   // Destruction / retrait
  'OTHER',
]);
export type TracabilityType = z.infer<typeof TracabilityTypeSchema>;

export const TracabilityPhotoSchema = z.object({
  id:              z.string(),
  tracabilityId:   z.string(),
  objectKey:       z.string(),
  url:             z.string(),
  caption:         z.string().nullish(),
  uploadedAt:      z.coerce.date(),
});
export type TracabilityPhoto = z.infer<typeof TracabilityPhotoSchema>;

export const TracabilitySchema = z.object({
  id:           z.string(),
  tenantId:     z.string(),
  reference:    z.string(),           // TRAC-YYYY-NNNN, per-tenant
  type:         TracabilityTypeSchema,
  status:       TracabilityStatusSchema,
  lotNumber:    z.string(),
  productName:  z.string(),
  supplierId:   z.string().nullish(), // FK to asset-service (no join)
  siteId:       z.string().nullish(), // FK to tenant-service (no join)
  quantity:     z.number().nullish(),
  unit:         z.string().nullish(),
  receptionDate: z.coerce.date().nullish(),
  expiryDate:   z.coerce.date().nullish(),
  temperature:  z.number().nullish(), // °C at reception/storage
  notes:        z.string().nullish(),
  createdById:  z.string(),
  createdAt:    z.coerce.date(),
  updatedAt:    z.coerce.date(),
  photos:       z.array(TracabilityPhotoSchema).optional(),
});
export type Tracability = z.infer<typeof TracabilitySchema>;

// ── DTOs ─────────────────────────────────────────────────────────────────────

export const CreateTracabilitySchema = z.object({
  // Simple interface — seuls champs visibles dans la nouvelle UI
  receptionDate: z.coerce.date().optional(),        // date du jour par défaut dans le service
  lotNumber:     z.string().max(100).optional(),    // numéro de lot, optionnel
  notes:         z.string().max(2000).nullish(),    // observations, optionnel
  // Champs legacy — conservés pour backward-compat API, ont des defaults dans le service
  type:          TracabilityTypeSchema.optional(),  // défaut: 'RECEPTION'
  productName:   z.string().max(200).optional(),    // défaut: auto-généré depuis le lot/référence
});
export type CreateTracabilityDto = z.infer<typeof CreateTracabilitySchema>;

export const UpdateTracabilitySchema = z.object({
  status:        TracabilityStatusSchema.optional(),
  type:          TracabilityTypeSchema.optional(),
  lotNumber:     z.string().min(1).max(100).optional(),
  productName:   z.string().min(1).max(200).optional(),
  supplierId:    z.string().cuid().nullish(),
  siteId:        z.string().cuid().nullish(),
  quantity:      z.coerce.number().positive().nullish(),
  unit:          z.string().max(20).nullish(),
  receptionDate: z.coerce.date().nullish(),
  expiryDate:    z.coerce.date().nullish(),
  temperature:   z.coerce.number().min(-100).max(200).nullish(),
  notes:         z.string().max(2000).nullish(),
});
export type UpdateTracabilityDto = z.infer<typeof UpdateTracabilitySchema>;

export const TracabilityQuerySchema = z.object({
  page:    z.coerce.number().int().min(1).default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(20),
  search:  z.string().optional(),
  type:    TracabilityTypeSchema.optional(),
  status:  TracabilityStatusSchema.optional(),
  from:    z.coerce.date().optional(),
  to:      z.coerce.date().optional(),
});
export type TracabilityQuery = z.infer<typeof TracabilityQuerySchema>;

// ── Stats ─────────────────────────────────────────────────────────────────────

export const TracabilityStatsSchema = z.object({
  total:       z.number(),
  inProgress:  z.number(),
  completed:   z.number(),
  cancelled:   z.number(),
  totalPhotos: z.number(),
});
export type TracabilityStats = z.infer<typeof TracabilityStatsSchema>;
