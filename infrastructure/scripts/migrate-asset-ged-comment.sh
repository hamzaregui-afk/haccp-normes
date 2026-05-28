#!/usr/bin/env bash
# migrate-asset-ged-comment.sh
# Idempotent DDL: adds the comment column to document_requests in haccp_assets.
# Run via run-migrations workflow action after any asset-service deployment.
set -e

PGUSER=$(docker exec haccp-postgres printenv POSTGRES_USER)
PGPASS=$(docker exec haccp-postgres printenv POSTGRES_PASSWORD)

run_sql() {
  docker exec -e PGPASSWORD="$PGPASS" haccp-postgres \
    psql -U "$PGUSER" -d haccp_assets -c "$1"
}

echo "--- Adding comment column to document_requests (idempotent) ---"
run_sql "ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS comment TEXT;"

echo "--- Marking migration as applied in _prisma_migrations ---"
run_sql "CREATE TABLE IF NOT EXISTS _prisma_migrations (
  id                      TEXT NOT NULL PRIMARY KEY,
  checksum                TEXT NOT NULL,
  finished_at             TIMESTAMP WITH TIME ZONE,
  migration_name          TEXT NOT NULL,
  logs                    TEXT,
  rolled_back_at          TIMESTAMP WITH TIME ZONE,
  started_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  applied_steps_count     INTEGER NOT NULL DEFAULT 0
);"
run_sql "INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,logs,applied_steps_count)
  VALUES ('a0b1c2d3-e4f5-0001-0001-000000000001','0000000000000000000000000000000000000000000000000000000000000000',NOW(),'20260529000000_add_doc_request_comment',NULL,1)
  ON CONFLICT (id) DO NOTHING;"

echo "=== document_requests.comment column applied ==="
