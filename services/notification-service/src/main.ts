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

  // ARCH-DECISION: Hybrid app — serves HTTP + WebSocket AND consumes RabbitMQ
  // messages simultaneously. connectMicroservice() registers the AMQP transport
  // before the HTTP server starts. startAllMicroservices() must be awaited so
  // the queue is consuming before any HTTP traffic arrives (avoids message loss
  // during a rolling restart where a producing service might publish before we
  // are ready to consume).
  const app = await NestFactory.create(AppModule);

  // ── RabbitMQ consumer transport ─────────────────────────────────────────────
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls:         [env.RABBITMQ_URL],
      queue:        'haccp_notification_queue',
      // ARCH-DECISION: No x-dead-letter-* arguments here.
      // RabbitMQ raises PRECONDITION_FAILED (406) if assertQueue() is called with
      // arguments that differ from those of the already-existing queue. Since the
      // queue was created before the DLQ feature was added, adding the arguments
      // here would crash every startup until the queue is manually deleted and
      // recreated.
      // The DLQ queue itself (haccp_notification_dlq) is declared by
      // QueueInitService.onModuleInit(). DLQ routing can be enabled later via:
      //   - RabbitMQ Management UI: Queues → haccp_notification_queue → Arguments
      //     (add x-dead-letter-exchange="" and x-dead-letter-routing-key="haccp_notification_dlq")
      //   - Or delete the queue and redeploy during a maintenance window.
      queueOptions: {
        durable: true,
      },
      // noAck: false ensures we acknowledge only after the handler succeeds,
      // preventing message loss if the process crashes mid-handler.
      noAck: false,
    },
  });

  // ── HTTP / WS setup ─────────────────────────────────────────────────────────
  app.use(correlationIdMiddleware);
  app.use(idempotencyMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  // Exclude socket.io path from the global prefix
  app.setGlobalPrefix('api/v1', { exclude: ['socket.io(.*)'] });
  app.enableCors({
    origin: env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });

  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('HACCP Notification Service')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  app.getHttpAdapter().get('/health', (_req: unknown, res: { json: (v: unknown) => void }) => {
    res.json({ status: 'ok', service: 'notification-service', uptime: process.uptime(), version: '0.1.0' });
  });

  // Start microservice transport first, then HTTP server
  await app.startAllMicroservices();
  await app.listen(env.PORT);

  logger.log(`🚀 notification-service running on port ${env.PORT}`);
  logger.log(`📨 RabbitMQ consumer active on queue haccp_notification_queue`);

  setupGracefulShutdown(app, logger, 'notification-service');
}

void bootstrap();
