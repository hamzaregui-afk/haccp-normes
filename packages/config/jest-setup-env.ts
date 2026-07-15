/**
 * Shared Jest setupFile — provides dummy environment variables BEFORE any module
 * loads. Each service's `src/config/env.ts` validates process.env at import time
 * and calls `process.exit(1)` on failure, which crashes any unit-test suite that
 * imports a service/controller (directly or transitively). These are inert
 * placeholders — unit tests mock all real I/O (DB, HTTP, queues).
 */
const set = (key: string, value: string): void => {
  if (!process.env[key]) process.env[key] = value;
};

// Jest defaults NODE_ENV to 'test', but the services' env schemas only allow
// development|staging|production → force a valid value (overrides jest's default).
process.env.NODE_ENV = 'development';
set('PORT', '3000');
set('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test');

// Auth / JWT (min 32 chars for the secrets)
set('JWT_SECRET', 'test_jwt_secret_at_least_32_characters_long_xx');
set('JWT_REFRESH_SECRET', 'test_refresh_secret_at_least_32_characters_xx');
set('JWT_EXPIRES_IN', '15m');
set('JWT_REFRESH_EXPIRES_IN', '7d');
set('INTERNAL_SERVICE_SECRET', 'test_internal_secret_at_least_32_characters_x');

// URLs / CORS
set('ALLOWED_ORIGINS', 'http://localhost:3000');
set('APP_URL', 'http://localhost:3000');
set('AUTH_SERVICE_URL', 'http://localhost:3010');
set('TENANT_SERVICE_URL', 'http://localhost:3018');
set('AUDIT_SERVICE_URL', 'http://localhost:3019');

// Infra
set('REDIS_URL', 'redis://localhost:6379');
set('RABBITMQ_URL', 'amqp://localhost:5672');

// MinIO
set('MINIO_ENDPOINT', 'localhost');
set('MINIO_PORT', '9000');
set('MINIO_ACCESS_KEY', 'minioadmin');
set('MINIO_SECRET_KEY', 'minioadmin');
set('MINIO_USE_SSL', 'false');
set('MINIO_BUCKET', 'test-bucket');
set('MINIO_BUCKET_REPORTS', 'test-reports');
set('MINIO_PUBLIC_URL', 'http://localhost:9000');

// SMTP / push
set('SMTP_HOST', 'localhost');
set('SMTP_PORT', '587');
set('SMTP_USER', 'test');
set('SMTP_PASS', 'test');
set('SMTP_FROM', 'noreply@example.com');
set('FCM_SERVER_KEY', 'test-fcm-key');
