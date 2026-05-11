import { z } from 'zod';

export const ChangePasswordDtoSchema = z.object({
  password: z.string().min(8).max(128),
});

export type ChangePasswordDto = z.infer<typeof ChangePasswordDtoSchema>;
