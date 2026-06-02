-- Migration: add tenant-scoped indexes for OutboxEvent and ControlSchedule
-- Safe: CREATE INDEX CONCURRENTLY does not lock tables

-- OutboxEvent: index on tenantId for per-tenant event processing
CREATE INDEX CONCURRENTLY IF NOT EXISTS "outbox_events_tenant_id_idx"
  ON "outbox_events" ("tenant_id");

-- OutboxEvent: composite index for "pending events for tenant" query
CREATE INDEX CONCURRENTLY IF NOT EXISTS "outbox_events_tenant_id_status_idx"
  ON "outbox_events" ("tenant_id", "status");

-- ControlSchedule: composite index for "active schedules for tenant" query
CREATE INDEX CONCURRENTLY IF NOT EXISTS "control_schedules_tenant_id_is_active_idx"
  ON "control_schedules" ("tenant_id", "is_active");
