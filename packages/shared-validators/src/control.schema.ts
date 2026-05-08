import { z } from 'zod';

export const CreateControlSchema = z.object({
  ccpId: z.string().uuid(),
  measuredValue: z.number().optional(),
  unit: z.string().max(20).optional(),
  notes: z.string().max(1000).optional(),
  performedAt: z.coerce.date().default(() => new Date()),
});

export type CreateControlDto = z.infer<typeof CreateControlSchema>;

export const CreateNonconformitySchema = z.object({
  controlId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  category: z.enum([
    'TEMPERATURE', 'HYGIENE', 'LABELING', 'TRACEABILITY',
    'EQUIPMENT', 'SUPPLIER', 'PROCESS', 'OTHER',
  ]),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  assignedToId: z.string().uuid().optional(),
  dueDate: z.coerce.date().optional(),
});

export type CreateNonconformityDto = z.infer<typeof CreateNonconformitySchema>;
