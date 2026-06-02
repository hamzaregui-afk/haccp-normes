import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrinterModule } from './printer/printer.module';
import { TemplateModule } from './template/template.module';
import { PrintJobModule } from './print-job/print-job.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    PrinterModule,
    TemplateModule,
    PrintJobModule,
  ],
})
export class AppModule {}
