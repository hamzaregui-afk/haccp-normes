import { z } from 'zod';

export const SubscriptionStatusSchema = z.enum([
  'TRIAL',
  'ACTIVE',
  'SUSPENDED',
  'CANCELLED',
  'EXPIRED',
]);

export const CreateSubscriptionDtoSchema = z.object({
  plan:        z.string().default('standard'),
  status:      SubscriptionStatusSchema.default('TRIAL'),
  trialEndsAt: z.string().datetime().optional(),
  expiresAt:   z.string().datetime().optional(),
  maxUsers:    z.coerce.number().int().min(1).max(10_000).default(10),
  maxSites:    z.coerce.number().int().min(1).max(1_000).default(3),
  notes:       z.string().max(1000).optional(),
});
export type CreateSubscriptionDto = z.infer<typeof CreateSubscriptionDtoSchema>;

export const UpdateSubscriptionDtoSchema = CreateSubscriptionDtoSchema.partial();
export type UpdateSubscriptionDto = z.infer<typeof UpdateSubscriptionDtoSchema>;
