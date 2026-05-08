-- CreateTable
-- CRITICAL: audit_logs is APPEND-ONLY. No UPDATE or DELETE operations — ever.
-- This is enforced at the application layer (Prisma schema has no updatedAt)
-- and additionally enforced via a PostgreSQL row-level security policy below.
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

-- ARCH-DECISION: Row-Level Security enforces append-only at the DB engine level,
-- providing a second line of defense beyond the application-layer constraint.
-- Even if a bug or compromised service process issues an UPDATE/DELETE, Postgres
-- will reject it. This is a legal/regulatory requirement for HACCP audit logs.
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

-- Allow inserts for the application role
CREATE POLICY "audit_logs_insert_only"
    ON "audit_logs"
    FOR INSERT
    WITH CHECK (true);

-- Explicitly deny UPDATE and DELETE at the DB level
CREATE POLICY "audit_logs_no_update"
    ON "audit_logs"
    FOR UPDATE
    USING (false);

CREATE POLICY "audit_logs_no_delete"
    ON "audit_logs"
    FOR DELETE
    USING (false);
