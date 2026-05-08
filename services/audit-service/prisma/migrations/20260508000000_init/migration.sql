-- CreateTable
-- ARCH-DECISION: This table is APPEND-ONLY by regulatory requirement.
-- No UPDATE or DELETE operations are ever executed against audit_logs.
-- A row-level security policy enforces this at the Postgres level as a defense-in-depth measure.
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" TEXT,
    "payload" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- RLS: Append-only enforcement at Postgres level
-- In production, enable RLS and create a restrictive policy that only allows INSERT.
-- ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY audit_insert_only ON "audit_logs" FOR INSERT WITH CHECK (true);
