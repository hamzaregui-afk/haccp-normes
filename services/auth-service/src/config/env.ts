import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV:              z.enum(['development', 'staging', 'production']).default('development'),
  PORT:                  z.coerce.number().default(3010),
  DATABASE_URL:          z.string().url(),
  JWT_SECRET:            z.string().min(32),
  JWT_EXPIRES_IN:        z.string().default('7d'),
  JWT_REFRESH_SECRET:    z.string().min(32),
  JWT_REFRESH_EXPIRES_IN:z.string().default('30d'),
  REDIS_URL:             z.string().url().optional(),
  ALLOWED_ORIGINS:       z.string().optional(),
  INTERNAL_SERVICE_SECRET: z.string().min(8).default('haccp-internal-dev-secret-change-in-prod'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ auth-service: invalid environment variables');
    console.error(JSON.stringify(result.error.flatten().fieldErrors, null, 2));
    process.exit(1);
  }
  return result.data;
}

// Singleton — call validateEnv() once at bootstrap, then import this object
let _env: Env | undefined;
export const env = new Proxy({} as Env, {
  get(_target, key: string) {
    if (!_env) _env = validateEnv();
    return _env[key as keyof Env];
  },
});
