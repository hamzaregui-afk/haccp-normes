-- Migration: Task Management Improvements
-- Fixes schema/migration drift and adds missing columns/tables/indexes

-- 1. Fix assignee_id nullability (was NOT NULL, Prisma schema says nullable)
ALTER TABLE "control_tasks" ALTER COLUMN "assignee_id" DROP NOT NULL;

-- 2. Add group_id column (missing from initial migration)
ALTER TABLE "control_tasks" ADD COLUMN IF NOT EXISTS "group_id" TEXT;

-- 3. Add checklist_snapshot column (copy of checklistJson at task creation time)
-- Critical for HACCP audit trail: frozen snapshot of what was asked, immutable after creation
ALTER TABLE "control_tasks" ADD COLUMN IF NOT EXISTS "checklist_snapshot" JSONB;

-- 4. Add updated_at column for change tracking
ALTER TABLE "control_tasks" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 5. Create control_photos table (was missing from initial migration)
CREATE TABLE IF NOT EXISTS "control_photos" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "control_photos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "control_photos_task_id_fkey" FOREIGN KEY ("task_id")
        REFERENCES "control_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 6. Composite indexes for common query patterns
-- (tenant_id, status) — getStats(), filtered task list
CREATE INDEX IF NOT EXISTS "control_tasks_tenant_status_idx"
    ON "control_tasks"("tenant_id", "status");

-- (tenant_id, scheduled_at) — date-range compliance queries
CREATE INDEX IF NOT EXISTS "control_tasks_tenant_scheduled_idx"
    ON "control_tasks"("tenant_id", "scheduled_at");

-- (tenant_id, assignee_id) — mobile operator task fetch
CREATE INDEX IF NOT EXISTS "control_tasks_tenant_assignee_idx"
    ON "control_tasks"("tenant_id", "assignee_id");

-- (status, scheduled_at) — OverdueScheduler cross-tenant updateMany
CREATE INDEX IF NOT EXISTS "control_tasks_status_scheduled_idx"
    ON "control_tasks"("status", "scheduled_at");

-- group_id single index (missing from initial migration)
CREATE INDEX IF NOT EXISTS "control_tasks_group_id_idx"
    ON "control_tasks"("group_id");

-- template_id index (no index existed, needed for FK cascade check and templateId filter)
CREATE INDEX IF NOT EXISTS "control_tasks_template_id_idx"
    ON "control_tasks"("template_id");

-- control_photos indexes
CREATE INDEX IF NOT EXISTS "control_photos_task_id_idx"
    ON "control_photos"("task_id");

CREATE INDEX IF NOT EXISTS "control_photos_tenant_id_idx"
    ON "control_photos"("tenant_id");
