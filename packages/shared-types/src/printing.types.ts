import { z } from 'zod';

// ARCH-DECISION: Entity schemas for the 4-level printing engine. Field names
// mirror the Prisma models (MediaProfile, PrinterAssignment) in printing-service.
// Entity ids use .cuid() (output shapes) — this is allowed; the input-DTO guardrail
// only forbids .cuid() on request payloads (see shared-validators/printing.schema).

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

export const MediaProfileSchema = z.object({
  id:            z.string().cuid(),
  tenantId:      z.string(),
  name:          z.string(),
  widthMm:       z.number(),
  heightMm:      z.number(),
  mediaType:     MediaTypeSchema,
  gapMm:         z.number().nullish(),
  blackMarkMm:   z.number().nullish(),
  dpi:           z.number().int(),
  speed:         z.number().int().nullish(),
  density:       z.number().int().nullish(),
  autoCalibrate: z.boolean(),
  isDefault:     z.boolean(),
  isActive:      z.boolean(),
  createdAt:     z.coerce.date(),
  updatedAt:     z.coerce.date(),
});
export type MediaProfile = z.infer<typeof MediaProfileSchema>;

export const PrinterAssignmentSchema = z.object({
  id:          z.string().cuid(),
  tenantId:    z.string(),
  printerId:   z.string(),
  scope:       AssignmentScopeSchema,
  referenceId: z.string(),
  priority:    z.number().int(),
  createdAt:   z.coerce.date(),
  updatedAt:   z.coerce.date(),
});
export type PrinterAssignment = z.infer<typeof PrinterAssignmentSchema>;
