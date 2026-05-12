import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { SiteModule } from './site/site.module';
import { TenantModule } from './tenant/tenant.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [AuthModule, TenantModule, SiteModule],
  controllers: [HealthController],
})
export class AppModule {}
