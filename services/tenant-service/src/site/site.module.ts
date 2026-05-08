import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SiteController } from './site.controller';
import { SiteService } from './site.service';

@Module({
  controllers: [SiteController],
  providers: [SiteService, PrismaService],
})
export class SiteModule {}
