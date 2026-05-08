import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV:        z.enum(['development', 'staging', 'production']).default('development'),
  PORT:            z.coerce.number().default(3015),
  DATABASE_URL:    z.string().url(),
  JWT_SECRET:      z.string().min(32),
  ALLOWED_ORIGINS: z.string().optional(),
  REDIS_URL:       z.string().optional().default('redis://localhost:6379'),
  // RabbitMQ — consumer of haccp_notification_queue
  RABBITMQ_URL:    z.string().optional().default('amqp://guest:guest@localhost:5672'),
  // SMTP — optional in development (Ethereal test account used as fallback)
  SMTP_HOST:       z.string().optional(),
  SMTP_PORT:       z.coerce.number().optional().default(587),
  SMTP_USER:       z.string().optional(),
  SMTP_PASS:       z.string().optional(),
  SMTP_FROM:       z.string().optional().default('NORMES HACCP <noreply@haccp.local>'),
  APP_URL:         z.string().url().optional().default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ notification-service: invalid environment variables');
    console.error(JSON.stringify(result.error.flatten().fieldErrors, null, 2));
    process.exit(1);
  }
  return result.data;
}

// ARCH-DECISION: Lazy proxy so env is validated once on first access rather than
// at import time. This allows the module to be imported in test files without
// requiring all env vars to be set before the test runner initialises.
let _env: Env | undefined;
export const env = new Proxy({} as Env, {
  get(_target, key: string) {
    if (!_env) _env = validateEnv();
    return _env[key as keyof Env];
  },
});
