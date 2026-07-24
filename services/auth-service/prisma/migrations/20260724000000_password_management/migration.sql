-- Password-management lifecycle (admin-driven reset workflow).
-- Fully ADDITIVE: new columns default to benign values, new table is independent.
-- Safe to run on a live production DB with existing users — no behaviour change
-- for any account until an admin explicitly resets/locks it.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "locked_by" TEXT,
  ADD COLUMN IF NOT EXISTS "lock_reason" TEXT;

CREATE TABLE IF NOT EXISTS "password_reset_events" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "performed_by_user_id" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "email_sent" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "password_reset_events_user_id_idx" ON "password_reset_events"("user_id");
CREATE INDEX IF NOT EXISTS "password_reset_events_tenant_id_idx" ON "password_reset_events"("tenant_id");
