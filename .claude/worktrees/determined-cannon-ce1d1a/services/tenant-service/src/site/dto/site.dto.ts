import { z } from 'zod';

export const CreateSiteDtoSchema = z.object({
  name:    z.string().min(1).max(200),
  address: z.string().max(500).optional(),
});
export type CreateSiteDto = z.infer<typeof CreateSiteDtoSchema>;

export const UpdateSiteDtoSchema = CreateSiteDtoSchema.partial();
export type UpdateSiteDto = z.infer<typeof UpdateSiteDtoSchema>;

export const CreateZoneDtoSchema = z.object({
  name: z.string().min(1).max(200),
});
export type CreateZoneDto = z.infer<typeof CreateZoneDtoSchema>;

export const UpdateZoneDtoSchema = CreateZoneDtoSchema.partial();
export type UpdateZoneDto = z.infer<typeof UpdateZoneDtoSchema>;
