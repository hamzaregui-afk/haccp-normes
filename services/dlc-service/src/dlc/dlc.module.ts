import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { DlcController } from './dlc.controller';
import { DlcService } from './dlc.service';

@Module({
  imports: [AuthModule],
  controllers: [DlcController],
  providers: [DlcService, PrismaService],
})
export class DlcModule {}
