import { z } from 'zod';
import { UserRoleSchema, UserStatusSchema } from '@haccp/shared-types';

export const UpdateUserDtoSchema = z.object({
  name:   z.string().min(1).max(200).optional(),
  role:   UserRoleSchema.exclude(['SUPER_ADMIN']).optional(),
  status: UserStatusSchema.optional(),
});

export type UpdateUserDto = z.infer<typeof UpdateUserDtoSchema>;
