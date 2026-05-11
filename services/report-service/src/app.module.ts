import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ReportModule } from './report/report.module';
import { HealthController } from './health.controller';

@Module({ imports: [AuthModule, ReportModule], controllers: [HealthController] })
export class AppModule {}
