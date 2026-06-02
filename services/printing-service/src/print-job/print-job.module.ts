import { Module } from '@nestjs/common';
import { PrintJobController } from './print-job.controller';
import { PrintJobService } from './print-job.service';
import { PrinterModule } from '../printer/printer.module';
import { TemplateModule } from '../template/template.module';

@Module({
  imports:     [PrinterModule, TemplateModule],
  controllers: [PrintJobController],
  providers:   [PrintJobService],
})
export class PrintJobModule {}
