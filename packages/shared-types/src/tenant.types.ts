import { z } from 'zod';

export const TenantStatusSchema = z.enum(['ACTIVE', 'ARCHIVED', 'SUSPENDED']);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

// ── Module system ─────────────────────────────────────────────────────────────
export const ALL_TENANT_MODULE_KEYS = [
  'DASHBOARD',
  'HACCP_CONTROLS',
  'NONCONFORMITIES',
  'DLC',
  'REPORTS',
  'EQUIPMENTS',
  'PRODUCTS',
  'SUPPLIERS',
  'GED',
  'NOTIFICATIONS',
  'AUDIT',
  'PLANNING',
  'TEMPERATURES',
  'RECEPTIONS',
  'HYGIENE',
  'ANALYTICS',
  'MOBILE_ACCESS',
  'TRACABILITY',
] as const;

export const TenantModuleKeySchema = z.enum(ALL_TENANT_MODULE_KEYS);
export type TenantModuleKey = z.infer<typeof TenantModuleKeySchema>;

export const TenantModuleSchema = z.object({
  id:        z.string().optional(),
  tenantId:  z.string().optional(),
  moduleKey: TenantModuleKeySchema,
  enabled:   z.boolean(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});
export type TenantModule = z.infer<typeof TenantModuleSchema>;

// ── Subscription system ───────────────────────────────────────────────────────
export const SubscriptionStatusSchema = z.enum([
  'TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED',
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const TenantSubscriptionSchema = z.object({
  id:          z.string(),
  tenantId:    z.string(),
  plan:        z.string().default('standard'),
  status:      SubscriptionStatusSchema.default('TRIAL'),
  trialEndsAt: z.coerce.date().nullish(),
  startedAt:   z.coerce.date(),
  expiresAt:   z.coerce.date().nullish(),
  maxUsers:    z.number().default(10),
  maxSites:    z.number().default(3),
  notes:       z.string().nullish(),
  createdAt:   z.coerce.date(),
  updatedAt:   z.coerce.date(),
});
export type TenantSubscription = z.infer<typeof TenantSubscriptionSchema>;

// ── Tenant schema ─────────────────────────────────────────────────────────────
export const TenantSchema = z.object({
  id:     z.string().cuid(),
  name:   z.string().min(1).max(200),
  slug:   z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  status: TenantStatusSchema.default('ACTIVE'),
  plan:   z.string().default('standard'),

  // Contact / branding (added in migration 20260518000000)
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  logo:  z.string().nullish(),
  primaryAdminId: z.string().nullish(),

  // Business / settings fields (added in migration 20260508120000)
  siret:                  z.string().max(14).nullish(),
  address:                z.string().max(500).nullish(),
  sector:                 z.string().max(100).nullish(),
  notifyNewNc:            z.boolean().default(false),
  notifyValidatedReports: z.boolean().default(false),
  notifyCriticalDlc:      z.boolean().default(false),

  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),

  // Relations (optional — not always included in list responses)
  modules:      z.array(TenantModuleSchema).optional(),
  subscription: TenantSubscriptionSchema.nullish(),
  _count:       z.object({
    sites:   z.number(),
    modules: z.number().optional(),
  }).optional(),
  sites: z.array(z.object({
    id:      z.string(),
    name:    z.string(),
    address: z.string().nullish(),
    zones:   z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  })).optional(),
});

export type Tenant = z.infer<typeof TenantSchema>;

export const CreateTenantSchema = TenantSchema.omit({
  id: true, createdAt: true, updatedAt: true,
  modules: true, subscription: true, _count: true, sites: true,
});
export type CreateTenant = z.infer<typeof CreateTenantSchema>;
