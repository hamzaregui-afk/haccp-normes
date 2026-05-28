import { Module } from '@nestjs/common';
import { TracabilityController } from './tracability.controller';
import { TracabilityService } from './tracability.service';

@Module({
  controllers: [TracabilityController],
  providers:   [TracabilityService],
})
export class TracabilityModule {}
