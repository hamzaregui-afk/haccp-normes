import { z } from 'zod';

export const CreateTenantDtoSchema = z.object({
  name:  z.string().min(1).max(200),
  slug:  z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  plan:  z.enum(['trial', 'standard', 'premium']).default('standard'),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
});
export type CreateTenantDto = z.infer<typeof CreateTenantDtoSchema>;

export const UpdateTenantDtoSchema = z.object({
  name:   z.string().min(1).max(200).optional(),
  plan:   z.enum(['trial', 'standard', 'premium']).optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED', 'SUSPENDED']).optional(),
  email:  z.string().email().optional(),
  phone:  z.string().max(30).optional(),
  logo:   z.string().url().optional(),

  // Primary admin reference (userId in user-service)
  primaryAdminId: z.string().optional(),

  // Business / settings fields — written by SettingsPage via PATCH /tenants/me
  siret:                  z.string().max(14).optional(),
  address:                z.string().max(500).optional(),
  sector:                 z.string().max(100).optional(),
  notifyNewNc:            z.boolean().optional(),
  notifyValidatedReports: z.boolean().optional(),
  notifyCriticalDlc:      z.boolean().optional(),
});
export type UpdateTenantDto = z.infer<typeof UpdateTenantDtoSchema>;
