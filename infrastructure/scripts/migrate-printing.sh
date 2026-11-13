#!/usr/bin/env bash
# migrate-printing.sh — ensure the haccp_printing DB exists, then apply the
# printing-service Prisma migrations. Run via the `run-migrations` workflow action.
#
# ARCH-DECISION: this delegates to `prisma migrate deploy` — the SAME command the
# printing-service Dockerfile runs on container boot. The previous version
# hand-wrote DDL and was broken + dangerous: it used invalid
# `CREATE TYPE IF NOT EXISTS` (Postgres has no IF NOT EXISTS on CREATE TYPE, so
# `set -e` aborted on a fresh DB), it was stale (missing media_profiles,
# printer_assignments, print_provider_config and all later columns), and it
# INSERTED a fake `_prisma_migrations` row that could make Prisma skip the real
# init or checksum-fail. Normal deploys never needed it (the Dockerfile migrates
# on boot); this is only the manual catch-up path. Idempotent; safe to re-run.
set -e

PGUSER=$(docker exec haccp-postgres printenv POSTGRES_USER)
PGPASS=$(docker exec haccp-postgres printenv POSTGRES_PASSWORD)

echo "--- Creating haccp_printing database (idempotent) ---"
docker exec -e PGPASSWORD="$PGPASS" haccp-postgres psql -U "$PGUSER" -d postgres \
  -c "CREATE DATABASE haccp_printing WITH OWNER $PGUSER;" 2>/dev/null \
  || echo "  haccp_printing already exists — skipping"

echo "--- Applying printing-service Prisma migrations (prisma migrate deploy) ---"
docker exec haccp-printing sh -c \
  'cd /app/services/printing-service && /app/node_modules/.pnpm/node_modules/.bin/prisma migrate deploy'

echo "=== haccp_printing migrations applied ==="
