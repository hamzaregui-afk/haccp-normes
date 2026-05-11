import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { DlcController } from './dlc.controller';
import { DlcExpiryTask } from './dlc-expiry.task';
import { DlcService } from './dlc.service';

@Module({
  imports: [AuthModule],
  controllers: [DlcController],
  providers: [DlcService, DlcExpiryTask, PrismaService],
})
export class DlcModule {}
