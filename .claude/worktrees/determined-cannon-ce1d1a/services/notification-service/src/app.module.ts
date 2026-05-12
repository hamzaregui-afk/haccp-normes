import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { NotificationModule } from './notification/notification.module';
import { HealthController } from './health.controller';

@Module({
  imports: [AuthModule, NotificationModule],
  controllers: [HealthController],
})
export class AppModule {}
