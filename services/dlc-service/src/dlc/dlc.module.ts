import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { DlcController } from './dlc.controller';
import { DlcInternalController } from './dlc-internal.controller';
import { DlcExpiryTask } from './dlc-expiry.task';
import { DlcService } from './dlc.service';

@Module({
  imports: [AuthModule],
  controllers: [DlcController, DlcInternalController],
  providers: [DlcService, DlcExpiryTask, PrismaService],
})
export class DlcModule {}
