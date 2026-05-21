import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';

import { AllExceptionsFilter } from '@haccp/shared-errors';
import { correlationIdMiddleware, idempotencyMiddleware, setupGracefulShutdown } from '@haccp/shared-utils';

import { validateEnv } from './config/env';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const env = validateEnv();

  // ARCH-DECISION: bodyParser disabled so we can set a custom JSON body size limit.
  // The NestJS default is 100kb which rejects checklists containing base64 photos
  // or signatures (each image ≈ 50–200kb after compression → total easily > 100kb).
  // 10mb matches the nginx client_max_body_size configured for /api/v1/controls.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use(correlationIdMiddleware);
  app.use(idempotencyMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('api/v1');
  // ARCH-DECISION: origin:true reflects the actual request Origin back in
  // Access-Control-Allow-Origin. Microservices are internal to the Docker
  // network — only nginx (port 80/3001) is reachable from the internet.
  // nginx is the authoritative CORS gate; service-level CORS is a fallback.
  app.enableCors({
    origin: true,
    credentials: true,
  });

  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('HACCP Control Service')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  app.getHttpAdapter().get('/health', (_req: unknown, res: { json: (v: unknown) => void }) => {
    res.json({ status: 'ok', service: 'control-service', uptime: process.uptime(), version: '0.1.0' });
  });

  await app.listen(env.PORT);
  logger.log(`🚀 control-service running on port ${env.PORT}`);

  setupGracefulShutdown(app, logger, 'control-service');
}

void bootstrap();
