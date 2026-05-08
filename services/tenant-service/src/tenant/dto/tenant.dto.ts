import { z } from 'zod';

export const CreateTenantDtoSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  plan: z.string().default('standard'),
});
export type CreateTenantDto = z.infer<typeof CreateTenantDtoSchema>;

export const UpdateTenantDtoSchema = z.object({
  name:   z.string().min(1).max(200).optional(),
  plan:   z.string().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED', 'SUSPENDED']).optional(),
});
export type UpdateTenantDto = z.infer<typeof UpdateTenantDtoSchema>;
