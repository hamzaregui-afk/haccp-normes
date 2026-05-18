import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantModuleController } from './tenant-module.controller';
import { TenantModuleService } from './tenant-module.service';

@Module({
  controllers: [TenantModuleController],
  providers:   [TenantModuleService, PrismaService],
  exports:     [TenantModuleService],
})
export class TenantModuleModule {}
