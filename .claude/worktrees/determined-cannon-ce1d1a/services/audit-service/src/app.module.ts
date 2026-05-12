import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { HealthController } from './health.controller';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [HealthController],
})
export class AppModule {}
