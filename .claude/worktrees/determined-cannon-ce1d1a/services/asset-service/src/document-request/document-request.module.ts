import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentRequestController } from './document-request.controller';
import { DocumentRequestService }    from './document-request.service';

@Module({
  imports:     [AuthModule],
  controllers: [DocumentRequestController],
  providers:   [DocumentRequestService, PrismaService],
})
export class DocumentRequestModule {}
