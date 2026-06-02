import { z } from 'zod';

// ── Create ─────────────────────────────────────────────────────────────────────

export const CreateTemplateSchema = z.object({
  name:        z.string().min(1).max(100),
  labelType:   z.string().min(1).max(50), // DLC, TRACABILITY, NC, etc.
  widthMm:     z.coerce.number().int().min(10).max(300).default(100),
  heightMm:    z.coerce.number().int().min(10).max(300).default(50),
  zplTemplate: z.string().min(1),        // Raw ZPL with {{variable}} placeholders
  isDefault:   z.boolean().default(false),
});

export type CreateTemplateDto = z.infer<typeof CreateTemplateSchema>;

// ── Update ─────────────────────────────────────────────────────────────────────

export const UpdateTemplateSchema = CreateTemplateSchema.partial();
export type UpdateTemplateDto = z.infer<typeof UpdateTemplateSchema>;

// ── Query ──────────────────────────────────────────────────────────────────────

export const TemplateQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
  labelType: z.string().optional(),
  isActive:  z.preprocess(v => v === 'true' || v === true, z.boolean()).optional(),
});

export type TemplateQuery = z.infer<typeof TemplateQuerySchema>;
