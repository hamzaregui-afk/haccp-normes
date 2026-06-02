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
  const env    = validateEnv();

  const app = await NestFactory.create(AppModule);

  app.use(correlationIdMiddleware);
  app.use(idempotencyMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: true, credentials: true });

  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('HACCP Printing Service')
      .setDescription('Thermal label printing — printers, ZPL templates, and print jobs')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  app.getHttpAdapter().get('/health', (_req: unknown, res: { json: (v: unknown) => void }) => {
    res.json({
      status:  'ok',
      service: 'printing-service',
      uptime:  process.uptime(),
      version: '0.1.0',
    });
  });

  await app.listen(env.PORT);
  logger.log(`🖨️  printing-service running on port ${env.PORT}`);

  setupGracefulShutdown(app, logger, 'printing-service');
}

void bootstrap();
