import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ControlModule } from './control/control.module';

@Module({ imports: [AuthModule, ControlModule] })
export class AppModule {}
