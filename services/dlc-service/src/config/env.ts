import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV:        z.enum(['development', 'staging', 'production']).default('development'),
  PORT:            z.coerce.number().default(3017),
  DATABASE_URL:    z.string().url(),
  JWT_SECRET:      z.string().min(32),
  ALLOWED_ORIGINS: z.string().optional(),
  AUDIT_SERVICE_URL:       z.string().url(),
  INTERNAL_SERVICE_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ dlc-service: invalid environment variables');
    console.error(JSON.stringify(result.error.flatten().fieldErrors, null, 2));
    process.exit(1);
  }
  return result.data;
}

let _env: Env | undefined;
export const env = new Proxy({} as Env, {
  get(_target, key: string) {
    if (!_env) _env = validateEnv();
    return _env[key as keyof Env];
  },
});
