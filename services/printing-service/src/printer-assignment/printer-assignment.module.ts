import { Module } from '@nestjs/common';
import { PrinterAssignmentController } from './printer-assignment.controller';
import { PrinterAssignmentService } from './printer-assignment.service';

@Module({
  controllers: [PrinterAssignmentController],
  providers:   [PrinterAssignmentService],
  exports:     [PrinterAssignmentService],
})
export class PrinterAssignmentModule {}
