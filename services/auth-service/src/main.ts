import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AllExceptionsFilter } from '@haccp/shared-errors';
import { correlationIdMiddleware, idempotencyMiddleware, setupGracefulShutdown } from '@haccp/shared-utils';

import { validateEnv } from './config/env';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const env = validateEnv();

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', ...(env.NODE_ENV !== 'production' ? ['debug' as const] : [])],
  });

  app.use(correlationIdMiddleware);
  app.use(idempotencyMiddleware);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  // ARCH-DECISION: exclude /internal/** from the versioned prefix so that
  // service-to-service calls (user-service → auth-service) use a stable,
  // version-independent path. /internal routes are blocked at the nginx
  // api-gateway layer so they are never reachable from outside the cluster.
  app.setGlobalPrefix('api/v1', { exclude: ['internal/(.*)'] });

  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });

  // Swagger — dev/staging only
  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('HACCP Auth Service')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
    logger.log(`📖 Swagger: http://localhost:${env.PORT}/api/docs`);
  }

  // Health endpoint (Rule 7 — outside the api/v1 prefix for easy k8s probing)
  app.getHttpAdapter().get('/health', (_req: unknown, res: { json: (v: unknown) => void }) => {
    res.json({ status: 'ok', service: 'auth-service', uptime: process.uptime(), version: '0.1.0' });
  });

  await app.listen(env.PORT);
  logger.log(`🚀 auth-service running on port ${env.PORT}`);

  setupGracefulShutdown(app, logger, 'auth-service');
}

void bootstrap();
