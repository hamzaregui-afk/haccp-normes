import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationConsumer } from './notification.consumer';
import { NotificationController } from './notification.controller';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';
import { EmailService } from './email.service';

@Module({
  imports: [AuthModule],
  // NotificationConsumer handles @EventPattern messages from the RabbitMQ microservice transport
  controllers: [NotificationController, NotificationConsumer],
  providers: [NotificationService, NotificationGateway, PrismaService, EmailService],
  exports: [NotificationService],
})
export class NotificationModule {}
