import { z } from 'zod';

export const DocumentCategorySchema = z.enum(['PROCEDURE', 'RECIPE', 'OTHER']);
export type DocumentCategory = z.infer<typeof DocumentCategorySchema>;

export const DocumentQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  category: DocumentCategorySchema.optional(),
  search:   z.string().max(200).optional(),
});

export type DocumentQuery = z.infer<typeof DocumentQuerySchema>;
