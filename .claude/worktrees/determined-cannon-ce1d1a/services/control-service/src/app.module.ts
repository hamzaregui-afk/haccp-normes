import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ControlModule } from './control/control.module';
import { HealthController } from './health.controller';

@Module({ imports: [AuthModule, ControlModule], controllers: [HealthController] })
export class AppModule {}
