import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { MinioModule } from './minio/minio.module';
import { TracabilityModule } from './tracability/tracability.module';

@Module({
  imports: [PrismaModule, MinioModule, AuthModule, TracabilityModule],
})
export class AppModule {}
