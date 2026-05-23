-- Migration: add source_task_id for idempotent NC auto-creation
--
-- ARCH-DECISION: When a control task completes with overallCompliant: false,
-- the nonconformity-service auto-creates an NC via a RabbitMQ event consumer.
-- RabbitMQ guarantees at-least-once delivery, so the same event may arrive
-- multiple times. source_task_id + tenant_id unique index enforces exactly-once
-- NC creation per task per tenant — the second insert fails with P2002 which
-- the consumer catches and swallows silently.
--
-- source_task_id is nullable because:
--   - All existing NCs were created manually (no sourceTaskId)
--   - Human-created NCs (via the UI) also have no sourceTaskId

-- Add the nullable source_task_id column
ALTER TABLE "non_conformities"
  ADD COLUMN "source_task_id" TEXT;

-- Add the compound unique constraint for idempotency.
-- PostgreSQL NULL semantics: NULL != NULL in unique indexes, so multiple rows
-- with source_task_id = NULL do not conflict — manual (UI-created) NCs are
-- unaffected. Only auto-created NCs (non-null source_task_id) are deduplicated.
CREATE UNIQUE INDEX "non_conformities_source_task_id_tenant_id_key"
  ON "non_conformities"("source_task_id", "tenant_id");
