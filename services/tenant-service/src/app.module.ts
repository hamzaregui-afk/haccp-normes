import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { SiteModule } from './site/site.module';
import { TenantModule } from './tenant/tenant.module';
import { TenantModuleModule } from './tenant-module/tenant-module.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { HealthController } from './health/health.controller';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    AuthModule,
    TenantModule,
    TenantModuleModule,
    SubscriptionModule,
    SiteModule,
    MetricsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
