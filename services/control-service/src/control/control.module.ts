import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MinioModule } from '../minio/minio.module';
import { PrismaService } from '../prisma/prisma.service';
import { ControlController } from './control.controller';
import { ControlsInternalController } from './controls-internal.controller';
import { ControlService } from './control.service';
import { OverdueScheduler } from './overdue.scheduler';

@Module({
  imports: [AuthModule, MinioModule],
  controllers: [ControlController, ControlsInternalController],
  providers: [ControlService, PrismaService, OverdueScheduler],
  exports: [ControlService],
})
export class ControlModule {}
