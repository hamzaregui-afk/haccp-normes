import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { SiteModule } from './site/site.module';
import { TenantModule } from './tenant/tenant.module';
import { TenantModuleModule } from './tenant-module/tenant-module.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { HealthController } from './health/health.controller';
import { MetricsModule } from './metrics/metrics.module';
import { TenantInternalController } from './tenant-internal/tenant-internal.controller';
import { PrismaService } from './prisma/prisma.service';

@Module({
  imports: [
    AuthModule,
    TenantModule,
    TenantModuleModule,
    SubscriptionModule,
    SiteModule,
    MetricsModule,
  ],
  controllers: [HealthController, TenantInternalController],
  providers:   [PrismaService],
})
export class AppModule {}
