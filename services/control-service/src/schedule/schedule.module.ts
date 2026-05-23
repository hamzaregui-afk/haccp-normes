import { Module } from '@nestjs/common';
import { AuthModule }     from '../auth/auth.module';
import { PrismaService }  from '../prisma/prisma.service';
import { ScheduleController }    from './schedule.controller';
import { ScheduleService }       from './schedule.service';
import { TaskGeneratorService }  from './generator/task-generator.service';

@Module({
  imports:     [AuthModule],
  controllers: [ScheduleController],
  providers:   [ScheduleService, TaskGeneratorService, PrismaService],
  exports:     [ScheduleService],
})
export class ScheduleModule {}
