import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV:              z.enum(['development', 'staging', 'production']).default('development'),
  PORT:                  z.coerce.number().default(3010),
  DATABASE_URL:          z.string().url(),
  JWT_SECRET:            z.string().min(32),
  JWT_EXPIRES_IN:        z.string().default('7d'),
  JWT_REFRESH_SECRET:    z.string().min(32),
  JWT_REFRESH_EXPIRES_IN:z.string().default('30d'),
  // ARCH-DECISION: REDIS_URL is required — auth-service uses Redis for refresh-token
  // blocklisting and rate-limiting state. A missing URL would silently disable
  // token revocation, which is a security regression.
  REDIS_URL:             z.string().default('redis://localhost:6379'),
  ALLOWED_ORIGINS:       z.string().optional(),
  // ARCH-DECISION: AUDIT_SERVICE_URL is required so every auth event (login,
  // logout, token refresh, password change) is recorded in the immutable audit log.
  AUDIT_SERVICE_URL:     z.string().url(),
  // ARCH-DECISION: no hardcoded default — the secret must be supplied via env.
  // docker-compose provides it via ${INTERNAL_SERVICE_SECRET}. Failing fast here
  // is safer than booting with a well-known weak secret.
  INTERNAL_SERVICE_SECRET: z.string().min(16),
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
