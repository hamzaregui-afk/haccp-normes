import { z } from 'zod';
import { UserRoleSchema } from '@haccp/shared-types';

export const CreateUserDtoSchema = z.object({
  email:    z.string().email(),
  name:     z.string().min(1).max(200),
  role:     UserRoleSchema.exclude(['SUPER_ADMIN']), // SUPER_ADMIN only via direct DB
  password: z.string().min(8).max(128).optional(),   // omit → sends invitation email
});

export type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;
