import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { NonconformityModule } from './nonconformity/nonconformity.module';

@Module({
  imports: [AuthModule, NonconformityModule],
})
export class AppModule {}
