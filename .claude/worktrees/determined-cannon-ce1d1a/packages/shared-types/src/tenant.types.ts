import { z } from 'zod';

export const TenantStatusSchema = z.enum(['ACTIVE', 'ARCHIVED', 'SUSPENDED']);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

export const TenantSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  status: TenantStatusSchema.default('ACTIVE'),
  plan: z.string().default('standard'),
  // Business / settings fields added in migration 20260508120000
  siret:                   z.string().max(14).nullish(),
  address:                 z.string().max(500).nullish(),
  sector:                  z.string().max(100).nullish(),
  notifyNewNc:             z.boolean().default(false),
  notifyValidatedReports:  z.boolean().default(false),
  notifyCriticalDlc:       z.boolean().default(false),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Tenant = z.infer<typeof TenantSchema>;

export const CreateTenantSchema = TenantSchema.omit({
  id: true, createdAt: true, updatedAt: true,
});
export type CreateTenant = z.infer<typeof CreateTenantSchema>;
