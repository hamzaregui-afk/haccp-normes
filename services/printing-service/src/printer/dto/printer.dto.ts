import { z } from 'zod';

// ── Enums (mirrored from Prisma schema for validation) ────────────────────────

export const ConnectionTypeSchema = z.enum(['NETWORK', 'BLUETOOTH', 'USB']);
export type ConnectionType = z.infer<typeof ConnectionTypeSchema>;

// Phase A additive enums (4-level printing engine). Optional on input so existing
// callers (web/mobile/agent) keep working unchanged.
export const PrinterProtocolSchema   = z.enum(['TSPL', 'ZPL', 'ESC_POS']);
export const PrinterConnectionSchema = z.enum(['USB', 'BLUETOOTH', 'WIFI', 'LOCAL_AGENT']);

// ── Create ────────────────────────────────────────────────────────────────────

export const CreatePrinterSchema = z.object({
  name:                z.string().min(1).max(100),
  model:               z.string().max(100).optional(),
  connectionType:      ConnectionTypeSchema.default('NETWORK'),
  ipAddress:           z.string().ip().optional(),
  port:                z.coerce.number().int().min(1).max(65535).default(9100),
  bluetoothIdentifier: z.string().max(100).optional(),
  isDefault:           z.boolean().default(false),
  siteId:              z.string().cuid().optional(),
  zoneId:              z.string().cuid().optional(),
  // Phase A additive fields (all optional → backward-compatible)
  brand:                 z.string().max(100).optional(),
  protocol:              PrinterProtocolSchema.optional(),
  connection:            PrinterConnectionSchema.optional(),
  defaultMediaProfileId: z.string().min(1).optional(),
});

export type CreatePrinterDto = z.infer<typeof CreatePrinterSchema>;

// ── Update ────────────────────────────────────────────────────────────────────

export const UpdatePrinterSchema = CreatePrinterSchema.partial();
export type UpdatePrinterDto = z.infer<typeof UpdatePrinterSchema>;

// ── Query ─────────────────────────────────────────────────────────────────────

export const PrinterQuerySchema = z.object({
  page:           z.coerce.number().int().min(1).default(1),
  limit:          z.coerce.number().int().min(1).max(100).default(20),
  connectionType: ConnectionTypeSchema.optional(),
  isActive:       z.preprocess(v => v === 'true' || v === true, z.boolean()).optional(),
});

export type PrinterQuery = z.infer<typeof PrinterQuerySchema>;
