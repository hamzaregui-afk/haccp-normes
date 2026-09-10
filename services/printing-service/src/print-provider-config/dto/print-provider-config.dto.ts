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

// PrintNode probe (test / list computers / list printers). Accepts an optional
// not-yet-saved key (in the request BODY, never a URL) so the client can validate
// before saving; falls back to the stored encrypted key when omitted.
export const PrintNodeProbeSchema = z.object({
  apiKey:     z.string().min(10).max(200).optional(),
  computerId: z.coerce.number().int().positive().optional(),
});
export type PrintNodeProbeDto = z.infer<typeof PrintNodeProbeSchema>;
