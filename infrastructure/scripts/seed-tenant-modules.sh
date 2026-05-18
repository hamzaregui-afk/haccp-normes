#!/usr/bin/env bash
# seed-tenant-modules.sh
# Idempotent seed: inserts TenantModule rows (all 17) and TenantSubscription
# for every tenant that doesn't have them yet.
# Uses plain INSERT...SELECT with CROSS JOIN VALUES — no PL/pgSQL needed.
# Safe to run multiple times — ON CONFLICT DO NOTHING.
set -euo pipefail

PGUSER=$(docker exec haccp-postgres printenv POSTGRES_USER)
PGPASS=$(docker exec haccp-postgres printenv POSTGRES_PASSWORD)

echo "=== Diagnosing tenant table ==="
docker exec -e PGPASSWORD="$PGPASS" haccp-postgres psql -U "$PGUSER" -d haccp_tenants -c \
  "SELECT id, name, plan, status FROM tenants ORDER BY name;"

echo "=== Inserting TenantModule rows (all 17 per tenant) ==="
docker exec -e PGPASSWORD="$PGPASS" haccp-postgres psql -U "$PGUSER" -d haccp_tenants -v ON_ERROR_STOP=1 -c "
INSERT INTO tenant_modules (id, tenant_id, module_key, enabled, created_at, updated_at)
SELECT
  gen_random_uuid()::TEXT,
  t.id,
  m.key::\"TenantModuleKey\",
  m.key IN (
    'DASHBOARD','HACCP_CONTROLS','NONCONFORMITIES','DLC','REPORTS',
    'EQUIPMENTS','PRODUCTS','SUPPLIERS','GED','NOTIFICATIONS','AUDIT'
  ),
  NOW(),
  NOW()
FROM tenants t
CROSS JOIN (VALUES
  ('DASHBOARD'),('HACCP_CONTROLS'),('NONCONFORMITIES'),('DLC'),('REPORTS'),
  ('EQUIPMENTS'),('PRODUCTS'),('SUPPLIERS'),('GED'),('NOTIFICATIONS'),('AUDIT'),
  ('PLANNING'),('TEMPERATURES'),('RECEPTIONS'),('HYGIENE'),('ANALYTICS'),('MOBILE_ACCESS')
) AS m(key)
ON CONFLICT (tenant_id, module_key) DO NOTHING;
"

echo "=== Inserting TenantSubscription rows ==="
docker exec -e PGPASSWORD="$PGPASS" haccp-postgres psql -U "$PGUSER" -d haccp_tenants -v ON_ERROR_STOP=1 -c "
INSERT INTO tenant_subscriptions (
  id, tenant_id, plan, status,
  started_at, max_users, max_sites,
  created_at, updated_at
)
SELECT
  gen_random_uuid()::TEXT,
  t.id,
  COALESCE(NULLIF(t.plan, ''), 'standard'),
  'ACTIVE'::\"SubscriptionStatus\",
  NOW(),
  50,
  10,
  NOW(),
  NOW()
FROM tenants t
ON CONFLICT (tenant_id) DO NOTHING;
"

echo "=== Verifying seed results ==="
docker exec -e PGPASSWORD="$PGPASS" haccp-postgres psql -U "$PGUSER" -d haccp_tenants -c "
SELECT
  t.name,
  t.plan,
  COUNT(CASE WHEN tm.enabled THEN 1 END) AS enabled_modules,
  COUNT(tm.id)                           AS total_module_rows,
  ts.status                              AS sub_status
FROM tenants t
LEFT JOIN tenant_modules tm        ON tm.tenant_id = t.id
LEFT JOIN tenant_subscriptions ts  ON ts.tenant_id = t.id
GROUP BY t.id, t.name, t.plan, ts.status
ORDER BY t.name;
"
echo "=== Seed complete ==="
