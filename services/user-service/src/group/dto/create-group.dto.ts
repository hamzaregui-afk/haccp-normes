import { z } from 'zod';

export const CreateGroupDtoSchema = z.object({
  name: z.string().min(1).max(100),
});
export type CreateGroupDto = z.infer<typeof CreateGroupDtoSchema>;

export const AddMemberDtoSchema = z.object({
  userId: z.string().cuid(),
});
export type AddMemberDto = z.infer<typeof AddMemberDtoSchema>;
