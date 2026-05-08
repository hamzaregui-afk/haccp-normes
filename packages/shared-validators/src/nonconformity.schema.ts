import { z } from 'zod';

// ARCH-DECISION: Enums are re-declared as z.enum string literals (not z.nativeEnum)
// so this shared package has no dependency on any service's Prisma client.
// Values must stay in sync with the nonconformity-service prisma/schema.prisma enums.

export const NCSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type NCSeverity = z.infer<typeof NCSeveritySchema>;

export const NCStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'CLOSED', 'REJECTED']);
export type NCStatus = z.infer<typeof NCStatusSchema>;

export const NCCategorySchema = z.enum([
  'TEMPERATURE',
  'HYGIENE',
  'LABELING',
  'TRACEABILITY',
  'EQUIPMENT',
  'SUPPLIER',
  'PROCESS',
  'OTHER',
]);
export type NCCategory = z.infer<typeof NCCategorySchema>;

export const CreateNcSchema = z.object({
  description:      z.string().min(1).max(2000),
  siteId:           z.string().optional(),
  productId:        z.string().optional(),
  correctiveAction: z.string().max(2000).optional(),
  severity:         NCSeveritySchema.default('MEDIUM'),
  category:         NCCategorySchema.default('OTHER'),
});
export type CreateNcDto = z.infer<typeof CreateNcSchema>;

export const UpdateNcSchema = z
  .object({
    status:           NCStatusSchema.optional(),
    correctiveAction: z.string().max(2000).optional(),
    closedById:       z.string().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateNcDto = z.infer<typeof UpdateNcSchema>;

export const NcQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  status:   NCStatusSchema.optional(),
  severity: NCSeveritySchema.optional(),
  search:   z.string().max(200).optional(),
});
export type NcQuery = z.infer<typeof NcQuerySchema>;
