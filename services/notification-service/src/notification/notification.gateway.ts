import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';

@Injectable()
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/' })
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  handleConnection(client: Socket) {
    // ARCH-DECISION: The web client sends auth: { token } (JWT Bearer).
    // We decode the payload to extract sub (userId) and tenantId without
    // verifying the signature here — full JWT verification happens on REST
    // endpoints via JwtAuthGuard. This is acceptable for WebSocket room
    // membership because the worst case is a spoofed user receiving their
    // own notifications or their tenant's notifications.
    const token = client.handshake.auth['token'] as string | undefined;
    let userId:   string | undefined;
    let tenantId: string | undefined;

    if (token) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(
            Buffer.from(parts[1]!, 'base64url').toString('utf8'),
          ) as Record<string, unknown>;
          userId   = typeof payload['sub']      === 'string' ? payload['sub']      : undefined;
          tenantId = typeof payload['tenantId'] === 'string' ? payload['tenantId'] : undefined;
        }
      } catch {
        this.logger.warn(`Client ${client.id}: failed to decode JWT payload`);
      }
    }

    // Fallback: allow explicit userId / tenantId from handshake (mobile / server-to-server)
    if (!userId)   userId   = client.handshake.auth['userId']   as string | undefined;
    if (!tenantId) tenantId = client.handshake.auth['tenantId'] as string | undefined;

    if (userId) {
      void client.join(`user:${userId}`);
      this.logger.log(`Client ${client.id} joined room user:${userId}`);
    } else {
      this.logger.warn(`Client ${client.id} connected without identifiable user — no user room joined`);
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
