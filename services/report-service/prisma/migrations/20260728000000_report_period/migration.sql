-- Persist the reporting period on reports (was accepted by the DTO but dropped).
-- Additive + nullable: safe on a live DB, no backfill needed.
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "period" TEXT;

-- Helps the (tenant, period) list filter used by the monthly report view.
CREATE INDEX IF NOT EXISTS "reports_tenant_id_period_idx" ON "reports"("tenant_id", "period");
