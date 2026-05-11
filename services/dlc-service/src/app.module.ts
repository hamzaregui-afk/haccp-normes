import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DlcModule } from './dlc/dlc.module';
import { HealthController } from './health.controller';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [AuthModule, DlcModule, MetricsModule],
  controllers: [HealthController],
})
export class AppModule {}
