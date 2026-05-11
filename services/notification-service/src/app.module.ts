import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { NotificationModule } from './notification/notification.module';
import { HealthController } from './health.controller';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [AuthModule, NotificationModule, MetricsModule],
  controllers: [HealthController],
})
export class AppModule {}
