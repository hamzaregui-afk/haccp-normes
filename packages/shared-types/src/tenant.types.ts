import { z } from 'zod';

export const TenantStatusSchema = z.enum(['ACTIVE', 'ARCHIVED', 'SUSPENDED']);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

export const TenantSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  status: TenantStatusSchema.default('ACTIVE'),
  plan: z.string().default('standard'),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Tenant = z.infer<typeof TenantSchema>;

export const CreateTenantSchema = TenantSchema.omit({
  id: true, createdAt: true, updatedAt: true,
});
export type CreateTenant = z.infer<typeof CreateTenantSchema>;
