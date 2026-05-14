/**
 * queue-init.service.ts
 *
 * Asserts the Dead Letter Queue (haccp_notification_dlq) on startup so that
 * messages rejected by haccp_notification_queue are captured rather than
 * silently dropped.
 *
 * ARCH-DECISION: Queue declaration lives here (not in RabbitMQ definitions.json
 * mounted via docker-compose) because loading definitions.json via
 * RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS changes the container's config hash and
 * causes Docker to RECREATE the rabbitmq container on `docker compose up -d`,
 * destroying in-flight messages and violating the infra-never-restart constraint
 * in deploy.sh. Programmatic assertQueue is idempotent — running it against an
 * already-declared queue with the same options is a no-op.
 *
 * The main notification queue (haccp_notification_queue) is declared by
 * NestJS @nestjs/microservices when connectMicroservice() is called in main.ts.
 * We only need to pre-declare the DLQ so the routing key is resolvable.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { connect } from 'amqplib';
import { env } from '../config/env';

const DLQ_NAME = 'haccp_notification_dlq';

@Injectable()
export class QueueInitService implements OnModuleInit {
  private readonly logger = new Logger(QueueInitService.name);

  async onModuleInit(): Promise<void> {
    // Retry loop — RabbitMQ may not be ready immediately on a cold start even
    // after the healthcheck passes (happens in CI where all containers start
    // simultaneously). We retry up to 5 times with a 2-second backoff.
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await this.assertDlq();
        this.logger.log(`✅ DLQ "${DLQ_NAME}" asserted successfully`);
        return;
      } catch (err) {
        const isLastAttempt = attempt === 5;
        const delay = attempt * 2_000;
        this.logger.warn(
          `DLQ assertion attempt ${attempt}/5 failed: ${(err as Error).message}` +
          (isLastAttempt ? ' — giving up' : ` — retrying in ${delay}ms`),
        );
        if (!isLastAttempt) {
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
  }

  private async assertDlq(): Promise<void> {
    const conn = await connect(env.RABBITMQ_URL);
    try {
      const channel = await conn.createChannel();
      try {
        // assertQueue is idempotent: if the queue already exists with the same
        // options, this is a no-op. If it exists with DIFFERENT options,
        // RabbitMQ throws a PRECONDITION_FAILED (406) — which is correct
        // behaviour; we want to detect config drift early.
        await channel.assertQueue(DLQ_NAME, {
          durable: true,
          // No x-dead-letter args — the DLQ itself has no further routing.
          // Messages in the DLQ stay until manually inspected/purged by ops.
        });
      } finally {
        await channel.close();
      }
    } finally {
      await conn.close();
    }
  }
}
