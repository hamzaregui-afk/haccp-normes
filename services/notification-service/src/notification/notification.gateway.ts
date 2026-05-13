import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { env } from '../config/env';

@Injectable()
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/' })
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth['token'] as string | undefined;
    let userId:   string | undefined;
    let tenantId: string | undefined;

    if (token) {
      try {
        // ARCH-DECISION: Verify JWT signature to prevent cross-tenant room spoofing.
        // The REST layer uses JwtAuthGuard for HTTP; here we inline the same verification
        // for WebSocket connections where Passport guards are unavailable.
        const payload = this.jwtService.verify<Record<string, unknown>>(token, {
          secret: env.JWT_SECRET,
        });
        userId   = typeof payload['sub']      === 'string' ? payload['sub']      : undefined;
        tenantId = typeof payload['tenantId'] === 'string' ? payload['tenantId'] : undefined;
      } catch {
        this.logger.warn(`Client ${client.id}: invalid JWT — disconnecting`);
        client.disconnect(true);
        return;
      }
    } else {
      // No token: disconnect anonymous clients
      this.logger.warn(`Client ${client.id}: no auth token — disconnecting`);
      client.disconnect(true);
      return;
    }

    if (userId) {
      void client.join(`user:${userId}`);
      this.logger.log(`Client ${client.id} joined room user:${userId}`);
    }

    // ARCH-DECISION: Each client also joins a tenant-scoped room so that
    // domain events (NC created, task completed, report validated) can be
    // broadcast to all connected users in the same tenant without knowing
    // individual user IDs. This avoids an inter-service call to user-service
    // to resolve notification recipients (acceptable for MVP).
    if (tenantId) {
      void client.join(`tenant:${tenantId}`);
      this.logger.log(`Client ${client.id} joined room tenant:${tenantId}`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  /** Push an event to all sockets belonging to a specific user. */
  emitToUser(userId: string, event: string, data: unknown): void {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Push a domain event to all sockets in a tenant's room.
   * Used by NotificationConsumer to broadcast RabbitMQ events in real-time.
   */
  emitToTenant(tenantId: string, event: string, data: unknown): void {
    this.server.to(`tenant:${tenantId}`).emit(event, data);
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { time: Date.now() });
  }
}
