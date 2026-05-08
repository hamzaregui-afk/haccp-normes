import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ReportModule } from './report/report.module';

@Module({ imports: [AuthModule, ReportModule] })
export class AppModule {}
