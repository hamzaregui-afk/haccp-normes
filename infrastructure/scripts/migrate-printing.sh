#!/usr/bin/env bash
# migrate-printing.sh
# Idempotent: creates the haccp_printing database and applies the initial schema.
# Run via run-migrations workflow action after any printing-service deployment.
set -e

PGUSER=$(docker exec haccp-postgres printenv POSTGRES_USER)
PGPASS=$(docker exec haccp-postgres printenv POSTGRES_PASSWORD)

run_sql() {
  docker exec -e PGPASSWORD="$PGPASS" haccp-postgres \
    psql -U "$PGUSER" "$@"
}

echo "--- Creating haccp_printing database (idempotent) ---"
run_sql -d postgres -c "CREATE DATABASE haccp_printing WITH OWNER $PGUSER;" 2>/dev/null \
  || echo "  haccp_printing already exists — skipping"

echo "--- Applying printing-service schema ---"
run_sql -d haccp_printing -c "
CREATE TYPE IF NOT EXISTS \"ConnectionType\" AS ENUM ('NETWORK', 'BLUETOOTH', 'USB');
CREATE TYPE IF NOT EXISTS \"PrintJobStatus\" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE IF NOT EXISTS printers (
  id                   TEXT        NOT NULL PRIMARY KEY,
  tenant_id            TEXT        NOT NULL,
  name                 TEXT        NOT NULL,
  model                TEXT,
  connection_type      \"ConnectionType\" NOT NULL DEFAULT 'NETWORK',
  ip_address           TEXT,
  port                 INTEGER     NOT NULL DEFAULT 9100,
  bluetooth_identifier TEXT,
  is_default           BOOLEAN     NOT NULL DEFAULT false,
  is_active            BOOLEAN     NOT NULL DEFAULT true,
  site_id              TEXT,
  zone_id              TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS printers_tenant_id_idx ON printers(tenant_id);

CREATE TABLE IF NOT EXISTS printer_templates (
  id           TEXT        NOT NULL PRIMARY KEY,
  tenant_id    TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  label_type   TEXT        NOT NULL,
  width_mm     INTEGER     NOT NULL DEFAULT 100,
  height_mm    INTEGER     NOT NULL DEFAULT 50,
  zpl_template TEXT        NOT NULL,
  is_default   BOOLEAN     NOT NULL DEFAULT false,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS printer_templates_tenant_type_idx ON printer_templates(tenant_id, label_type);

CREATE TABLE IF NOT EXISTS print_jobs (
  id            TEXT             NOT NULL PRIMARY KEY,
  tenant_id     TEXT             NOT NULL,
  user_id       TEXT             NOT NULL,
  printer_id    TEXT             REFERENCES printers(id),
  template_id   TEXT,
  label_type    TEXT             NOT NULL,
  payload       JSONB            NOT NULL,
  zpl           TEXT,
  status        \"PrintJobStatus\" NOT NULL DEFAULT 'PENDING',
  error_message TEXT,
  copies        INTEGER          NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  printed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS print_jobs_tenant_id_idx        ON print_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS print_jobs_tenant_status_idx    ON print_jobs(tenant_id, status);
"

echo "--- Marking migration in _prisma_migrations ---"
run_sql -d haccp_printing -c "
CREATE TABLE IF NOT EXISTS _prisma_migrations (
  id                      TEXT NOT NULL PRIMARY KEY,
  checksum                TEXT NOT NULL,
  finished_at             TIMESTAMP WITH TIME ZONE,
  migration_name          TEXT NOT NULL,
  logs                    TEXT,
  rolled_back_at          TIMESTAMP WITH TIME ZONE,
  started_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  applied_steps_count     INTEGER NOT NULL DEFAULT 0
);
INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,logs,applied_steps_count)
  VALUES ('b1c2d3e4-f5a6-0001-0001-000000000001','0000000000000000000000000000000000000000000000000000000000000000',NOW(),'20260601000000_init_printing',NULL,1)
  ON CONFLICT (id) DO NOTHING;
"

echo "=== haccp_printing schema applied ==="
