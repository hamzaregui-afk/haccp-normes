import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { EquipmentModule } from './equipment/equipment.module';
import { ProductModule } from './product/product.module';
import { SupplierModule } from './supplier/supplier.module';

@Module({
  imports: [AuthModule, ProductModule, EquipmentModule, SupplierModule],
})
export class AppModule {}
