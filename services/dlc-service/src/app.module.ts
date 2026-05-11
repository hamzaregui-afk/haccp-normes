import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DlcModule } from './dlc/dlc.module';
import { HealthController } from './health.controller';

@Module({
  imports: [AuthModule, DlcModule],
  controllers: [HealthController],
})
export class AppModule {}
