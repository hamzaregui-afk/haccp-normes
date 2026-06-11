import { z } from 'zod';

// ARCH-DECISION: Input (Create/Update/Query) schemas for the 4-level printing
// engine. Field names mirror the Prisma models in printing-service exactly.
// Reference-id fields use z.string().min(1) (NOT .cuid()) per the repo guardrail
// scripts/check-no-cuid-in-dtos.sh — seeded/imported ids may not be CUIDs.

// ── Enums (mirrored from Prisma) ──────────────────────────────────────────────

export const MediaTypeSchema = z.enum(['GAP', 'BLACK_MARK', 'CONTINUOUS']);
export type MediaType = z.infer<typeof MediaTypeSchema>;

export const PrinterProtocolSchema = z.enum(['TSPL', 'ZPL', 'ESC_POS']);
export type PrinterProtocol = z.infer<typeof PrinterProtocolSchema>;

export const PrinterConnectionSchema = z.enum(['USB', 'BLUETOOTH', 'WIFI', 'LOCAL_AGENT']);
export type PrinterConnection = z.infer<typeof PrinterConnectionSchema>;

export const PrinterStatusSchema = z.enum(['UNKNOWN', 'ONLINE', 'OFFLINE', 'ERROR']);
export type PrinterStatus = z.infer<typeof PrinterStatusSchema>;

export const AssignmentScopeSchema = z.enum(['SITE', 'ZONE', 'USER', 'MODULE']);
export type AssignmentScope = z.infer<typeof AssignmentScopeSchema>;

// ── MediaProfile (Niveau 2) ───────────────────────────────────────────────────

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

// ── PrinterAssignment (Niveau 4) ──────────────────────────────────────────────

export const CreatePrinterAssignmentSchema = z.object({
  printerId:   z.string().min(1),
  scope:       AssignmentScopeSchema,
  referenceId: z.string().min(1), // siteId | zoneId | userId | module key
  priority:    z.coerce.number().int().min(0).max(1000).default(0),
});
export type CreatePrinterAssignmentDto = z.infer<typeof CreatePrinterAssignmentSchema>;

export const UpdatePrinterAssignmentSchema = CreatePrinterAssignmentSchema.partial();
export type UpdatePrinterAssignmentDto = z.infer<typeof UpdatePrinterAssignmentSchema>;

export const PrinterAssignmentQuerySchema = z.object({
  page:        z.coerce.number().int().min(1).default(1),
  limit:       z.coerce.number().int().min(1).max(100).default(50),
  scope:       AssignmentScopeSchema.optional(),
  referenceId: z.string().min(1).optional(),
  printerId:   z.string().min(1).optional(),
});
export type PrinterAssignmentQuery = z.infer<typeof PrinterAssignmentQuerySchema>;

// Resolution context: pick the highest-priority printer matching the most
// specific scope available (ZONE > SITE > USER > MODULE handled in the service).
export const ResolvePrinterQuerySchema = z.object({
  module: z.string().min(1).optional(),
  siteId: z.string().min(1).optional(),
  zoneId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
});
export type ResolvePrinterQuery = z.infer<typeof ResolvePrinterQuerySchema>;
