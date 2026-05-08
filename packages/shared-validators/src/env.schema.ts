import { z } from 'zod';

/**
 * Base env schema — extended by each service's own src/config/env.ts.
 * Every service MUST call envSchema.parse(process.env) at startup.
 */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().min(1024).max(65535).default(3000),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid Redis connection string').optional(),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
