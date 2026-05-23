import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { NonconformityService } from './nonconformity.service';
import { NonconformityController } from './nonconformity.controller';
import { TaskCompletedConsumer } from './consumers/task-completed.consumer';

@Module({
  // ARCH-DECISION: TaskCompletedConsumer is registered as a controller (not a
  // provider) so NestJS microservice transport recognises its @EventPattern
  // decorators and wires them up to the AMQP channel automatically.
  controllers: [NonconformityController, TaskCompletedConsumer],
  providers:   [NonconformityService, PrismaService, MinioService],
  exports:     [NonconformityService],
})
export class NonconformityModule {}
