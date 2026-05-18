import { z } from 'zod';

export const ALL_MODULE_KEYS = [
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
] as const;

export type TenantModuleKey = (typeof ALL_MODULE_KEYS)[number];

export const TenantModuleKeySchema = z.enum(ALL_MODULE_KEYS);

export const SetTenantModulesDtoSchema = z.object({
  modules: z.array(
    z.object({
      moduleKey: TenantModuleKeySchema,
      enabled:   z.boolean(),
    }),
  ),
});
export type SetTenantModulesDto = z.infer<typeof SetTenantModulesDtoSchema>;

// ── Plan default modules ───────────────────────────────────────────────────────
// ARCH-DECISION: Plans define the MINIMUM set of modules. SUPER_ADMIN can
// override any module (enable extras or disable defaults) per tenant.
export const PLAN_DEFAULT_MODULES: Record<string, TenantModuleKey[]> = {
  trial: [
    'DASHBOARD',
    'HACCP_CONTROLS',
    'NONCONFORMITIES',
    'DLC',
  ],
  standard: [
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
  ],
  premium: [...ALL_MODULE_KEYS],
};
