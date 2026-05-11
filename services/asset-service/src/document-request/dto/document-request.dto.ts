import { z } from 'zod';

export const CreateDocRequestSchema = z.object({
  title:       z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  category:    z.enum(['PROCEDURE', 'RECIPE', 'OTHER']).optional(),
});

export const UpdateDocRequestSchema = z.object({
  status:      z.enum(['FULFILLED', 'REJECTED']),
  fulfillerId: z.string().optional(),
  documentId:  z.string().optional(),
});

export const DocRequestQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'FULFILLED', 'REJECTED']).optional(),
});

export type CreateDocRequestDto = z.infer<typeof CreateDocRequestSchema>;
export type UpdateDocRequestDto = z.infer<typeof UpdateDocRequestSchema>;
export type DocRequestQuery     = z.infer<typeof DocRequestQuerySchema>;
