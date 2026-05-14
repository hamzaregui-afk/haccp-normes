import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { NotificationModule } from './notification/notification.module';
import { QueueInitService } from './queue/queue-init.service';
import { HealthController } from './health.controller';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [AuthModule, NotificationModule, MetricsModule],
  controllers: [HealthController],
  // QueueInitService runs onModuleInit to assert the DLQ before any messages
  // arrive — see src/queue/queue-init.service.ts for the rationale.
  providers: [QueueInitService],
})
export class AppModule {}
