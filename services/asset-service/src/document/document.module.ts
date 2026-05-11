import { Module } from '@nestjs/common';
import { AuthModule }      from '../auth/auth.module';
import { MinioModule }     from '../minio/minio.module';
import { PrismaService }   from '../prisma/prisma.service';
import { DocumentController } from './document.controller';
import { DocumentService }    from './document.service';

@Module({
  imports:     [AuthModule, MinioModule],
  controllers: [DocumentController],
  providers:   [DocumentService, PrismaService],
})
export class DocumentModule {}
