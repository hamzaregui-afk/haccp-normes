import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ControlModule } from './control/control.module';
import { HealthController } from './health.controller';
import { MetricsModule } from './metrics/metrics.module';

@Module({ imports: [AuthModule, ControlModule, MetricsModule], controllers: [HealthController] })
export class AppModule {}
