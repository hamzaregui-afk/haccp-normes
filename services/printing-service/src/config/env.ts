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
