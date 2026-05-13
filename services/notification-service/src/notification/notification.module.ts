import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationConsumer } from './notification.consumer';
import { NotificationController } from './notification.controller';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';
import { EmailService } from './email.service';
import { env } from '../config/env';

@Module({
  imports: [
    AuthModule,
    // ARCH-DECISION: JwtModule is registered here (not just in AuthModule) so that
    // NotificationGateway can inject JwtService for WebSocket connection verification.
    // The REST endpoints use Passport/JwtAuthGuard from AuthModule; WebSocket connections
    // cannot use Passport guards, so we verify the token directly via JwtService.
    JwtModule.register({ secret: env.JWT_SECRET }),
  ],
  // NotificationConsumer handles @EventPattern messages from the RabbitMQ microservice transport
  controllers: [NotificationController, NotificationConsumer],
  providers: [NotificationService, NotificationGateway, PrismaService, EmailService],
  exports: [NotificationService],
})
export class NotificationModule {}
