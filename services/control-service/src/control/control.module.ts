import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { ControlController } from './control.controller';
import { ControlService } from './control.service';

@Module({
  imports: [AuthModule],
  controllers: [ControlController],
  providers: [ControlService, PrismaService],
  exports: [ControlService],
})
export class ControlModule {}
