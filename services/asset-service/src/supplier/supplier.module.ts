import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupplierController } from './supplier.controller';
import { SupplierService } from './supplier.service';

@Module({
  controllers: [SupplierController],
  providers: [SupplierService, PrismaService],
  exports: [SupplierService],
})
export class SupplierModule {}
