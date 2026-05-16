import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV:        z.enum(['development', 'staging', 'production']).default('development'),
  PORT:            z.coerce.number().default(3016),
  DATABASE_URL:    z.string().url(),
  JWT_SECRET:      z.string().min(32),
  ALLOWED_ORIGINS: z.string().optional(),
  RABBITMQ_URL:    z.string().default('amqp://guest:guest@localhost:5672'),
  // MinIO — object storage for generated PDF reports
  MINIO_ENDPOINT:       z.string().default('minio'),
  MINIO_PORT:           z.coerce.number().default(9000),
  MINIO_ACCESS_KEY:     z.string().default('minioadmin'),
  MINIO_SECRET_KEY:     z.string().default('minioadmin'),
  MINIO_BUCKET_REPORTS: z.string().default('haccp-reports'),
  MINIO_USE_SSL:        z.preprocess(v => v === 'true' || v === '1', z.boolean()).default(false),
  // Public URL to replace internal minio hostname in presigned URLs served to browsers
  MINIO_PUBLIC_URL:     z.string().url().optional(),
  // Service-to-service
  AUDIT_SERVICE_URL:       z.string().url(),
  INTERNAL_SERVICE_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ report-service: invalid environment variables');
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
