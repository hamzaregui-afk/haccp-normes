-- CreateEnum
CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateTable: outbox_events
-- ARCH-DECISION: Written in the same transaction as business entities to
-- guarantee at-least-once delivery to RabbitMQ even on process crash.
CREATE TABLE "outbox_events" (
    "id"             TEXT NOT NULL,
    "event_type"     TEXT NOT NULL,
    "tenant_id"      TEXT NOT NULL,
    "payload"        JSONB NOT NULL,
    "status"         "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
    "retries"        INTEGER NOT NULL DEFAULT 0,
    "correlation_id" TEXT,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at"   TIMESTAMP(3),
    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- Index: fast poll of PENDING rows ordered by creation time
CREATE INDEX "outbox_events_status_created_at_idx" ON "outbox_events"("status", "created_at");
