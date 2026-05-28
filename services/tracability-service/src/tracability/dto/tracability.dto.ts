import { z } from 'zod';
import {
  CreateTracabilitySchema,
  UpdateTracabilitySchema,
  TracabilityQuerySchema,
} from '@haccp/shared-types';

export { CreateTracabilitySchema, UpdateTracabilitySchema, TracabilityQuerySchema };
export type CreateTracabilityDto = z.infer<typeof CreateTracabilitySchema>;
export type UpdateTracabilityDto = z.infer<typeof UpdateTracabilitySchema>;
export type TracabilityQuery     = z.infer<typeof TracabilityQuerySchema>;
