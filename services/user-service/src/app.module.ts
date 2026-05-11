import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { GroupModule } from './group/group.module';
import { UserModule } from './user/user.module';
import { HealthController } from './health/health.controller';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [AuthModule, UserModule, GroupModule, MetricsModule],
  controllers: [HealthController],
})
export class AppModule {}
