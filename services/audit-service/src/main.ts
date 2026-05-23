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

  // ARCH-DECISION: Hybrid app — serves HTTP (REST + audit viewer) AND consumes
  // domain events from haccp_audit_queue for append-only audit recording.
  // The AMQP transport is registered before HTTP starts so that no events are
  // missed during a rolling restart.
  const app = await NestFactory.create(AppModule);

  // ── RabbitMQ consumer transport ─────────────────────────────────────────────
  // ARCH-DECISION: Separate queue from haccp_notification_queue so that audit
  // writes do not contend with notification dispatches. publishDomainEvent()
  // in shared-utils publishes to both queues in parallel.
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls:         [env.RABBITMQ_URL],
      queue:        'haccp_audit_queue',
      queueOptions: { durable: true },
      // noAck: false → acknowledge only after the handler completes, preventing
      // message loss if the process crashes mid-write.
      noAck: false,
    },
  });

  // ── HTTP setup ──────────────────────────────────────────────────────────────
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
      .setTitle('HACCP Audit Service — APPEND-ONLY')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  app.getHttpAdapter().get('/health', (_req: unknown, res: { json: (v: unknown) => void }) => {
    res.json({ status: 'ok', service: 'audit-service', uptime: process.uptime(), version: '0.1.0' });
  });

  // Start AMQP consumer BEFORE HTTP so domain events are consumed immediately
  await app.startAllMicroservices();
  await app.listen(env.PORT);
  logger.log(`🚀 audit-service running on port ${env.PORT} — consuming haccp_audit_queue`);

  setupGracefulShutdown(app, logger, 'audit-service');
}

void bootstrap();
