import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { HealthController } from './health.controller';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [AuthModule, AuditModule, MetricsModule],
  controllers: [HealthController],
})
export class AppModule {}
