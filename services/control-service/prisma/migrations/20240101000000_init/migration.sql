-- CreateEnum
CREATE TYPE "ControlType" AS ENUM (
    'RECEPTION',
    'TEMPERATURE_STOCK',
    'TEMPERATURE_DISPLAY',
    'TEMPERATURE_OIL',
    'EQUIPMENT',
    'SANITARY',
    'DAILY_PRODUCTION'
);

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED');

-- CreateTable
CREATE TABLE "control_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ControlType" NOT NULL,
    "checklist_json" JSONB NOT NULL,
    "frequency" TEXT,
    "tenant_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "control_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_tasks" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,
    "assignee_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PLANNED',
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "result_json" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "control_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "control_templates_tenant_id_idx" ON "control_templates"("tenant_id");

-- CreateIndex
CREATE INDEX "control_tasks_tenant_id_idx" ON "control_tasks"("tenant_id");

-- CreateIndex
CREATE INDEX "control_tasks_assignee_id_idx" ON "control_tasks"("assignee_id");

-- CreateIndex
CREATE INDEX "control_tasks_scheduled_at_idx" ON "control_tasks"("scheduled_at");

-- CreateIndex
CREATE INDEX "control_tasks_status_idx" ON "control_tasks"("status");

-- AddForeignKey
ALTER TABLE "control_tasks" ADD CONSTRAINT "control_tasks_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "control_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
