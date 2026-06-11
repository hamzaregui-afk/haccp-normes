import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrinterModule } from './printer/printer.module';
import { TemplateModule } from './template/template.module';
import { PrintJobModule } from './print-job/print-job.module';
import { MediaProfileModule } from './media-profile/media-profile.module';
import { PrinterAssignmentModule } from './printer-assignment/printer-assignment.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    PrinterModule,
    TemplateModule,
    PrintJobModule,
    MediaProfileModule,
    PrinterAssignmentModule,
  ],
})
export class AppModule {}
