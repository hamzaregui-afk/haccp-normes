import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { NonconformityModule } from './nonconformity/nonconformity.module';
import { HealthController } from './health.controller';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [AuthModule, NonconformityModule, MetricsModule],
  controllers: [HealthController],
})
export class AppModule {}
