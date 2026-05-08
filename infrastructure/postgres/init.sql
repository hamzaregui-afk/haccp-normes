-- ─── Create one database per service ─────────────────────────────────────────
-- Runs once on first postgres container start via docker-entrypoint-initdb.d/
-- Each service manages its own schema via Prisma migrate deploy
-- NOTE: PostgreSQL does not support IF NOT EXISTS on CREATE DATABASE;
--       this script runs exactly once on fresh volume init so duplicates
--       are not a concern.

CREATE DATABASE haccp_auth;
CREATE DATABASE haccp_users;
CREATE DATABASE haccp_tenants;
CREATE DATABASE haccp_controls;
CREATE DATABASE haccp_nonconformities;
CREATE DATABASE haccp_assets;
CREATE DATABASE haccp_reports;
CREATE DATABASE haccp_dlc;
CREATE DATABASE haccp_audit;
CREATE DATABASE haccp_notifications;

-- ─── Audit DB: RLS to enforce append-only at the DB level ─────────────────────
-- Applied after Prisma creates the audit_logs table (via migrate deploy).
-- This is belt-and-suspenders on top of the application-layer constraint.
--
-- \c haccp_audit;
-- ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY audit_insert_only ON audit_logs
--   FOR INSERT WITH CHECK (true);
-- REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;
--
-- Uncomment after first migration runs.
