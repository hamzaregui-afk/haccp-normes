import { z } from 'zod';

// ARCH-DECISION: Schemas are defined locally (mirroring printer.dto.ts) rather
// than imported from @haccp/shared-validators, to keep the service free of a
// build-time dependency on that package's dist. The canonical client-facing
// copies live in shared-validators/src/printing.schema.ts. Reference ids use
// .min(1) (not .cuid()) per scripts/check-no-cuid-in-dtos.sh.

export const MediaTypeSchema = z.enum(['GAP', 'BLACK_MARK', 'CONTINUOUS']);

export const CreateMediaProfileSchema = z.object({
  name:          z.string().min(1).max(100),
  widthMm:       z.coerce.number().positive().max(2000),
  heightMm:      z.coerce.number().positive().max(2000),
  mediaType:     MediaTypeSchema.default('GAP'),
  gapMm:         z.coerce.number().min(0).max(100).optional(),
  blackMarkMm:   z.coerce.number().min(0).max(100).optional(),
  dpi:           z.coerce.number().int().min(100).max(1200).default(203),
  speed:         z.coerce.number().int().min(1).max(100).optional(),
  density:       z.coerce.number().int().min(0).max(30).optional(),
  autoCalibrate: z.boolean().default(true),
  isDefault:     z.boolean().default(false),
});
export type CreateMediaProfileDto = z.infer<typeof CreateMediaProfileSchema>;

export const UpdateMediaProfileSchema = CreateMediaProfileSchema.partial();
export type UpdateMediaProfileDto = z.infer<typeof UpdateMediaProfileSchema>;

export const MediaProfileQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
  mediaType: MediaTypeSchema.optional(),
  isActive:  z.preprocess(v => v === 'true' || v === true, z.boolean()).optional(),
});
export type MediaProfileQuery = z.infer<typeof MediaProfileQuerySchema>;
