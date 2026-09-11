import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV:                z.enum(['development', 'staging', 'production']).default('development'),
  PORT:                    z.coerce.number().default(3021),
  DATABASE_URL:            z.string().url(),
  RABBITMQ_URL:            z.string().default('amqp://guest:guest@localhost:5672'),
  JWT_SECRET:              z.string().min(32),
  INTERNAL_SERVICE_SECRET: z.string().min(1),
  AUDIT_SERVICE_URL:       z.string().url().default('http://audit-service:3019/api/v1'),
  ALLOWED_ORIGINS:         z.string().optional(),
  // Lot 3: 32+ char secret used to AES-256-GCM encrypt per-tenant PrintNode API
  // keys at rest. OPTIONAL — when absent, PrintNode features are disabled and the
  // service still boots. Provision it (server env / GitHub secret) to enable
  // PrintNode. Must never be committed.
  //
  // ARCH-DECISION: preprocess empty/whitespace → undefined. docker-compose injects
  // `ENCRYPTION_KEY: ${ENCRYPTION_KEY:-}`, which is an empty STRING (not unset) when
  // the key isn't provisioned. `.optional()` only accepts `undefined`, so a bare
  // `.min(32).optional()` REJECTS "" and crash-loops the whole service on boot.
  // Coercing "" → undefined lets the service boot key-less as intended.
  ENCRYPTION_KEY: z.preprocess(
    (v) => (typeof v === 'string' && v.trim().length === 0 ? undefined : v),
    z.string().min(32).optional(),
  ),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ printing-service: invalid environment variables');
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
