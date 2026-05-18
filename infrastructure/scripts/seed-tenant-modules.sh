#!/usr/bin/env bash
# seed-tenant-modules.sh
# Idempotent seed: inserts TenantModule rows (all 17) and TenantSubscription
# for every tenant that doesn't have them yet.
# Safe to run multiple times — uses ON CONFLICT DO NOTHING.
set -euo pipefail

PGUSER=$(docker exec haccp-postgres printenv POSTGRES_USER)
PGPASS=$(docker exec haccp-postgres printenv POSTGRES_PASSWORD)

echo "=== Seeding TenantModule + TenantSubscription for all existing tenants ==="

docker exec -e PGPASSWORD="$PGPASS" haccp-postgres psql -U "$PGUSER" -d haccp_tenants -v ON_ERROR_STOP=1 <<'ENDSQL'
DO $$
DECLARE
  r RECORD;
  all_modules TEXT[] := ARRAY[
    'DASHBOARD','HACCP_CONTROLS','NONCONFORMITIES','DLC','REPORTS',
    'EQUIPMENTS','PRODUCTS','SUPPLIERS','GED','NOTIFICATIONS','AUDIT',
    'PLANNING','TEMPERATURES','RECEPTIONS','HYGIENE','ANALYTICS','MOBILE_ACCESS'
  ];
  standard_modules TEXT[] := ARRAY[
    'DASHBOARD','HACCP_CONTROLS','NONCONFORMITIES','DLC','REPORTS',
    'EQUIPMENTS','PRODUCTS','SUPPLIERS','GED','NOTIFICATIONS','AUDIT'
  ];
  trial_modules TEXT[] := ARRAY[
    'DASHBOARD','HACCP_CONTROLS','NONCONFORMITIES','DLC'
  ];
  tenant_plan TEXT;
  enabled_modules TEXT[];
  mod TEXT;
  now_ts TIMESTAMPTZ := NOW();
  trial_end TIMESTAMPTZ := NOW() + INTERVAL '14 days';
BEGIN
  FOR r IN SELECT id, plan FROM tenants WHERE status != 'ARCHIVED' LOOP
    tenant_plan := COALESCE(r.plan, 'standard');
    IF tenant_plan = 'premium' THEN
      enabled_modules := all_modules;
    ELSIF tenant_plan = 'trial' THEN
      enabled_modules := trial_modules;
    ELSE
      enabled_modules := standard_modules;
    END IF;

    -- Insert all 17 module rows (skip if already exists)
    FOREACH mod IN ARRAY all_modules LOOP
      INSERT INTO tenant_modules (id, tenant_id, module_key, enabled, created_at, updated_at)
      VALUES (
        gen_random_uuid()::TEXT,
        r.id,
        mod::"TenantModuleKey",
        mod = ANY(enabled_modules),
        now_ts,
        now_ts
      )
      ON CONFLICT (tenant_id, module_key) DO NOTHING;
    END LOOP;

    -- Insert subscription row (skip if already exists)
    INSERT INTO tenant_subscriptions (
      id, tenant_id, plan, status,
      trial_ends_at, started_at, max_users, max_sites,
      created_at, updated_at
    )
    VALUES (
      gen_random_uuid()::TEXT,
      r.id,
      tenant_plan,
      CASE tenant_plan
        WHEN 'trial'   THEN 'TRIAL'::"SubscriptionStatus"
        WHEN 'premium' THEN 'ACTIVE'::"SubscriptionStatus"
        ELSE                'ACTIVE'::"SubscriptionStatus"
      END,
      CASE tenant_plan WHEN 'trial' THEN trial_end ELSE NULL END,
      now_ts,
      CASE tenant_plan WHEN 'trial' THEN 5 WHEN 'premium' THEN 500 ELSE 50 END,
      CASE tenant_plan WHEN 'trial' THEN 1 WHEN 'premium' THEN 100 ELSE 10 END,
      now_ts,
      now_ts
    )
    ON CONFLICT (tenant_id) DO NOTHING;

    RAISE NOTICE 'Seeded tenant: % (plan: %)', r.id, tenant_plan;
  END LOOP;
END$$;
ENDSQL

echo "=== Verifying seed results ==="
PGUSER=$(docker exec haccp-postgres printenv POSTGRES_USER)
PGPASS=$(docker exec haccp-postgres printenv POSTGRES_PASSWORD)
docker exec -e PGPASSWORD="$PGPASS" haccp-postgres psql -U "$PGUSER" -d haccp_tenants -c "
  SELECT t.name, t.plan,
         COUNT(CASE WHEN tm.enabled THEN 1 END) AS enabled_modules,
         COUNT(tm.id) AS total_module_rows,
         ts.status AS sub_status
  FROM tenants t
  LEFT JOIN tenant_modules tm ON tm.tenant_id = t.id
  LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = t.id
  GROUP BY t.id, t.name, t.plan, ts.status
  ORDER BY t.name;
"
echo "=== Tenant modules seed complete ==="
