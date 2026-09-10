import { z } from 'zod';

export const UpdatePrintProviderConfigSchema = z
  .object({
    // Set or rotate the tenant's PrintNode API key. Omit to leave it unchanged.
    printNodeApiKey:  z.string().min(10).max(200).optional(),
    printNodeEnabled: z.boolean().optional(),
  })
  .refine((d) => d.printNodeApiKey !== undefined || d.printNodeEnabled !== undefined, {
    message: 'Fournir printNodeApiKey et/ou printNodeEnabled',
  });

export type UpdatePrintProviderConfigDto = z.infer<typeof UpdatePrintProviderConfigSchema>;
