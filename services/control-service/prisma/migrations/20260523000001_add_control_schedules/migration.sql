-- Migration: add recurring schedule engine
--
-- Adds:
--   ScheduleFrequency enum
--   control_schedules table (recurrence rules + scheduling state)
--   control_tasks.schedule_id (FK to control_schedules, nullable)
--   @@unique([schedule_id, scheduled_at]) for idempotent task generation
--
-- ARCH-DECISION: schedule_id is nullable — one-off tasks (created manually)
-- have no schedule. PostgreSQL treats NULL != NULL in unique indexes, so
-- multiple one-off tasks with the same scheduled_at are allowed.
--
-- ARCH-DECISION: The unique partial-like behaviour on (schedule_id, scheduled_at)
-- is achieved by a standard UNIQUE INDEX — PostgreSQL's NULL semantics already
-- exclude the one-off task case without needing a WHERE clause.

-- 1. ScheduleFrequency enum
CREATE TYPE "ScheduleFrequency" AS ENUM (
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'YEARLY',
  'CUSTOM'
);

-- 2. control_schedules table
CREATE TABLE "control_schedules" (
  "id"                TEXT NOT NULL,
  "tenant_id"         TEXT NOT NULL,
  "template_id"       TEXT NOT NULL,
  "zone_id"           TEXT NOT NULL,
  "assignee_id"       TEXT,
  "group_id"          TEXT,
  "frequency"         "ScheduleFrequency" NOT NULL,
  "recurrence_json"   JSONB NOT NULL,
  "timezone"          TEXT NOT NULL DEFAULT 'UTC',
  "start_date"        TIMESTAMP(3) NOT NULL,
  "end_date"          TIMESTAMP(3),
  "is_active"         BOOLEAN NOT NULL DEFAULT true,
  "last_generated_at" TIMESTAMP(3),
  "next_run_at"       TIMESTAMP(3),
  "created_by"        TEXT NOT NULL,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "control_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "control_schedules_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "control_templates"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "control_schedules_tenant_id_idx"
  ON "control_schedules"("tenant_id");

CREATE INDEX "control_schedules_is_active_next_run_at_idx"
  ON "control_schedules"("is_active", "next_run_at");

-- 3. Add schedule_id FK to control_tasks
ALTER TABLE "control_tasks"
  ADD COLUMN "schedule_id" TEXT;

ALTER TABLE "control_tasks"
  ADD CONSTRAINT "control_tasks_schedule_id_fkey"
    FOREIGN KEY ("schedule_id") REFERENCES "control_schedules"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Idempotency unique index on (schedule_id, scheduled_at)
--    NULL values are considered distinct → one-off tasks are unaffected.
CREATE UNIQUE INDEX "control_tasks_schedule_id_scheduled_at_key"
  ON "control_tasks"("schedule_id", "scheduled_at");

CREATE INDEX "control_tasks_schedule_id_idx"
  ON "control_tasks"("schedule_id");
