import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { NonconformityModule } from './nonconformity/nonconformity.module';
import { HealthController } from './health.controller';

@Module({
  imports: [AuthModule, NonconformityModule],
  controllers: [HealthController],
})
export class AppModule {}
