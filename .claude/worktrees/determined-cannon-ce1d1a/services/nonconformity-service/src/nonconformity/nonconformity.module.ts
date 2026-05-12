import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { NonconformityService } from './nonconformity.service';
import { NonconformityController } from './nonconformity.controller';

@Module({
  controllers: [NonconformityController],
  providers:   [NonconformityService, PrismaService, MinioService],
  exports:     [NonconformityService],
})
export class NonconformityModule {}
