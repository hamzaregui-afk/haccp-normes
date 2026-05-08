import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { SiteModule } from './site/site.module';
import { TenantModule } from './tenant/tenant.module';

@Module({
  imports: [AuthModule, TenantModule, SiteModule],
})
export class AppModule {}
