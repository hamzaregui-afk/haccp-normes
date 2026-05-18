import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantModuleService } from '../tenant-module/tenant-module.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';

@Module({
  controllers: [TenantController],
  providers:   [TenantService, TenantModuleService, SubscriptionService, PrismaService],
  exports:     [TenantService],
})
export class TenantModule {}
