import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuditController } from './audit.controller';
import { AuditInternalController } from './audit-internal.controller';
import { AuditService } from './audit.service';

@Module({
  imports: [AuthModule],
  controllers: [AuditController, AuditInternalController],
  providers: [AuditService, PrismaService],
  exports: [AuditService],
})
export class AuditModule {}
