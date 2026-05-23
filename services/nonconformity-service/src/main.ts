import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AllExceptionsFilter } from '@haccp/shared-errors';
import { correlationIdMiddleware, idempotencyMiddleware, setupGracefulShutdown } from '@haccp/shared-utils';

import { validateEnv } from './config/env';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const env = validateEnv();

  // ARCH-DECISION: Hybrid app — serves HTTP AND consumes RabbitMQ messages.
  // connectMicroservice() registers the AMQP transport before the HTTP server
  // starts. startAllMicroservices() is awaited first so the queue is active
  // before any HTTP traffic arrives (avoids message loss during rolling restarts).
  const app = await NestFactory.create(AppModule);

  // ── RabbitMQ consumer transport ─────────────────────────────────────────────
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls:  [env.RABBITMQ_URL],
      queue: 'haccp_nonconformity_queue',
      // ARCH-DECISION: No DLQ arguments on initial queue creation — adding them
      // later would cause PRECONDITION_FAILED (406) against existing queues.
      // See notification-service main.ts for the same pattern and rationale.
      queueOptions: {
        durable: true,
      },
      noAck: false,
    },
  });

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
      .setTitle('HACCP Nonconformity Service')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  app.getHttpAdapter().get('/health', (_req: unknown, res: { json: (v: unknown) => void }) => {
    res.json({ status: 'ok', service: 'nonconformity-service', uptime: process.uptime(), version: '0.1.0' });
  });

  // Start microservice transport first, then HTTP server
  await app.startAllMicroservices();
  await app.listen(env.PORT);

  logger.log(`🚀 nonconformity-service running on port ${env.PORT}`);
  logger.log(`📨 RabbitMQ consumer active on queue haccp_nonconformity_queue`);

  setupGracefulShutdown(app, logger, 'nonconformity-service');
}

void bootstrap();
