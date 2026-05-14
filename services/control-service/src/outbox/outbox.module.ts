import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxWorker } from './outbox.worker';

@Module({
  imports:   [ScheduleModule.forRoot()],
  providers: [PrismaService, OutboxWorker],
})
export class OutboxModule {}
