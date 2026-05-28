#!/usr/bin/env bash
# migrate-tracability.sh
# Idempotent DDL for the tracability-service database.
# Run after container start when prisma/migrations were missing from the image.
set -e

PGUSER=$(docker exec haccp-postgres printenv POSTGRES_USER)
PGPASS=$(docker exec haccp-postgres printenv POSTGRES_PASSWORD)

run_sql() {
  docker exec -e PGPASSWORD="$PGPASS" haccp-postgres \
    psql -U "$PGUSER" -d haccp_tracabilities -c "$1"
}

echo "--- Creating enums (idempotent) ---"
run_sql "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='TracabilityType') THEN
    CREATE TYPE \"TracabilityType\" AS ENUM ('RECEPTION','PRODUCTION','EXPEDITION','INTERNAL','DESTRUCTION','OTHER');
  END IF;
END \$\$;"

run_sql "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='TracabilityStatus') THEN
    CREATE TYPE \"TracabilityStatus\" AS ENUM ('IN_PROGRESS','COMPLETED','CANCELLED');
  END IF;
END \$\$;"

echo "--- Creating tracabilities table ---"
run_sql "CREATE TABLE IF NOT EXISTS tracabilities (
  id            TEXT NOT NULL,
  reference     TEXT NOT NULL,
  tenant_id     TEXT NOT NULL,
  type          \"TracabilityType\" NOT NULL DEFAULT 'RECEPTION',
  status        \"TracabilityStatus\" NOT NULL DEFAULT 'IN_PROGRESS',
  lot_number    TEXT NOT NULL,
  product_name  TEXT NOT NULL,
  supplier_id   TEXT,
  site_id       TEXT,
  quantity      DOUBLE PRECISION,
  unit          VARCHAR(20),
  reception_date TIMESTAMP(3),
  expiry_date   TIMESTAMP(3),
  temperature   DOUBLE PRECISION,
  notes         TEXT,
  created_by_id TEXT NOT NULL,
  created_at    TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT tracabilities_pkey PRIMARY KEY (id)
);"

run_sql "CREATE UNIQUE INDEX IF NOT EXISTS tracabilities_reference_tenant_id_key ON tracabilities(reference,tenant_id);"
run_sql "CREATE INDEX IF NOT EXISTS tracabilities_tenant_id_idx ON tracabilities(tenant_id);"
run_sql "CREATE INDEX IF NOT EXISTS tracabilities_tenant_id_status_idx ON tracabilities(tenant_id,status);"
run_sql "CREATE INDEX IF NOT EXISTS tracabilities_tenant_id_type_idx ON tracabilities(tenant_id,type);"
run_sql "CREATE INDEX IF NOT EXISTS tracabilities_created_at_idx ON tracabilities(created_at);"

echo "--- Creating tracability_photos table ---"
run_sql "CREATE TABLE IF NOT EXISTS tracability_photos (
  id             TEXT NOT NULL,
  tracability_id TEXT NOT NULL,
  object_key     TEXT NOT NULL,
  url            TEXT NOT NULL,
  caption        VARCHAR(500),
  uploaded_at    TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT tracability_photos_pkey PRIMARY KEY (id)
);"

run_sql "DO \$\$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='tracability_photos_tracability_id_fkey'
  ) THEN
    ALTER TABLE tracability_photos
      ADD CONSTRAINT tracability_photos_tracability_id_fkey
      FOREIGN KEY (tracability_id) REFERENCES tracabilities(id) ON DELETE CASCADE;
  END IF;
END \$\$;"

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
  VALUES ('20260528000000_init','0000000000000000000000000000000000000000000000000000000000000000',NOW(),'20260528000000_init',NULL,1)
  ON CONFLICT (id) DO NOTHING;"

echo "=== tracability schema applied ==="
