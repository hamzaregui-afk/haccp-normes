import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV:                z.enum(['development', 'staging', 'production']).default('development'),
  PORT:                    z.coerce.number().default(3019),
  DATABASE_URL:            z.string().url(),
  JWT_SECRET:              z.string().min(32),
  ALLOWED_ORIGINS:         z.string().optional(),
  // ARCH-DECISION: Service-to-service audit calls use a shared secret instead of JWT.
  // The internal endpoint is NOT exposed via api-gateway, only accessible inside
  // the Docker network. This avoids a circular dependency where audit-service would
  // need to verify JWTs issued by auth-service.
  INTERNAL_SERVICE_SECRET: z.string().min(16).default('haccp-internal-dev-secret-change-in-prod'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ audit-service: invalid environment variables');
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
