import { z } from 'zod';
import { NCStatus, NCSeverity, NCCategory } from '@prisma/client';

// ─── Create DTO ──────────────────────────────────────────────────────────────

export const CreateNcDtoSchema = z.object({
  description:      z.string().min(1).max(5000),
  siteId:           z.string().min(1),
  productId:        z.string().optional(),
  severity:         z.nativeEnum(NCSeverity).default(NCSeverity.MEDIUM),
  category:         z.nativeEnum(NCCategory).default(NCCategory.OTHER),
  correctiveAction: z.string().optional(),
});

export type CreateNcDto = z.infer<typeof CreateNcDtoSchema>;

// ─── Update DTO ──────────────────────────────────────────────────────────────

export const UpdateNcDtoSchema = z
  .object({
    status:           z.nativeEnum(NCStatus).optional(),
    severity:         z.nativeEnum(NCSeverity).optional(),
    category:         z.nativeEnum(NCCategory).optional(),
    correctiveAction: z.string().optional(),
    closedById:       z.string().optional(),
  })
  // closedAt is set automatically by the service when status transitions to CLOSED
  .strict();

export type UpdateNcDto = z.infer<typeof UpdateNcDtoSchema>;

// ─── Query / Pagination DTO ───────────────────────────────────────────────────

export const NcQuerySchema = z.object({
  page:     z.coerce.number().int().positive().default(1),
  // max(500): dashboard chart queries fetch up to 200 NCs for 6-month trend graphs
  limit:    z.coerce.number().int().positive().max(500).default(20),
  status:   z.nativeEnum(NCStatus).optional(),
  severity: z.nativeEnum(NCSeverity).optional(),
  search:   z.string().optional(),
});

export type NcQuery = z.infer<typeof NcQuerySchema>;
