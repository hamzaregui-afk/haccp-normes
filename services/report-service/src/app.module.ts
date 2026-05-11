import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ReportModule } from './report/report.module';
import { HealthController } from './health.controller';
import { MetricsModule } from './metrics/metrics.module';

@Module({ imports: [AuthModule, ReportModule, MetricsModule], controllers: [HealthController] })
export class AppModule {}
