import { Module } from '@nestjs/common';
import { AuthModule }     from './auth/auth.module';
import { ControlModule }  from './control/control.module';
import { OutboxModule }   from './outbox/outbox.module';
import { ScheduleModule } from './schedule/schedule.module';
import { HealthController } from './health.controller';
import { MetricsModule }  from './metrics/metrics.module';

@Module({
  imports:     [AuthModule, ControlModule, OutboxModule, ScheduleModule, MetricsModule],
  controllers: [HealthController],
})
export class AppModule {}
