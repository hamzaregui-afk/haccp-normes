import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';

@Module({
  controllers: [ReportController],
  providers: [ReportService, PrismaService],
})
export class ReportModule {}
