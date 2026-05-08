import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DlcModule } from './dlc/dlc.module';

@Module({
  imports: [AuthModule, DlcModule],
})
export class AppModule {}
