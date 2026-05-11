import { Module } from '@nestjs/common';
import { AuthModule }            from './auth/auth.module';
import { EquipmentModule }       from './equipment/equipment.module';
import { ProductModule }         from './product/product.module';
import { SupplierModule }        from './supplier/supplier.module';
import { DocumentModule }        from './document/document.module';
import { DocumentRequestModule } from './document-request/document-request.module';

@Module({
  imports: [AuthModule, ProductModule, EquipmentModule, SupplierModule, DocumentModule, DocumentRequestModule],
})
export class AppModule {}
