import { z } from 'zod';

// Registration of a mobile device's Expo push token. Platform constrains the
// value to the two we build for. tenantId/userId/role are NEVER taken from the
// body — the controller derives them from the validated JWT.
export const RegisterDeviceDtoSchema = z.object({
  expoPushToken: z.string().min(1),
  platform:      z.enum(['ios', 'android']),
});
export type RegisterDeviceDto = z.infer<typeof RegisterDeviceDtoSchema>;

export const UnregisterDeviceDtoSchema = z.object({
  expoPushToken: z.string().min(1),
});
export type UnregisterDeviceDto = z.infer<typeof UnregisterDeviceDtoSchema>;
