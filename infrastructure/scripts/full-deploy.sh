#!/bin/bash
# full-deploy.sh — called from deploy.yml SSH action after git pull
# Working directory: /opt/haccp
# Required env vars: SUPERADMIN_HASH, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD
set -e

echo "=== Git commit on server after pull ==="
git log --oneline -3

echo "=== Fixing web .env (VITE_API_URL pinned to port 80) ==="
printf 'VITE_API_URL=https://178.105.126.165\nVITE_WS_URL=\n' > apps/web/.env
echo "apps/web/.env written: $(cat apps/web/.env)"

echo "=== Building all images ==="
DOCKER_BUILDKIT=1 docker compose build --parallel

echo "=== Starting all services with new images ==="
docker compose up -d --remove-orphans

echo "=== Waiting 30s for services to start ==="
sleep 30

echo "=== Container status ==="
docker compose ps --format "table {{.Name}}\t{{.Status}}" | head -20

echo "=== Port bindings (3001 must point to haccp-gateway) ==="
ss -tlnp | grep -E "3001|:80 " || true

PGUSER=$(docker exec haccp-postgres printenv POSTGRES_USER)
PGPASS=$(docker exec haccp-postgres printenv POSTGRES_PASSWORD)

echo "=== printing-service migration ==="
bash infrastructure/scripts/migrate-printing.sh || echo "printing migration non-fatal"

echo "=== Activating TRACABILITY module for all tenants ==="
docker exec -e PGPASSWORD="$PGPASS" haccp-postgres psql -U "$PGUSER" -d haccp_tenants \
  -c "ALTER TYPE \"TenantModuleKey\" ADD VALUE IF NOT EXISTS 'TRACABILITY';" 2>&1 || echo "ALTER TYPE already exists"
docker exec -e PGPASSWORD="$PGPASS" haccp-postgres psql -U "$PGUSER" -d haccp_tenants -c "
  INSERT INTO tenant_modules (id, tenant_id, module_key, enabled, created_at, updated_at)
  SELECT gen_random_uuid()::TEXT, t.id, 'TRACABILITY', true, NOW(), NOW()
  FROM tenants t
  ON CONFLICT (tenant_id, module_key) DO NOTHING;
" 2>&1 && echo "TRACABILITY activated for all tenants" || echo "tenant_modules upsert skipped"

ADMIN_ID="clx_superadmin_platform_01"
ADMIN_HASH="$SUPERADMIN_HASH"
ADMIN_EMAIL="${SUPERADMIN_EMAIL:-superadmin@haccp.com}"

echo "=== Seeding superadmin into haccp_auth ==="
SQL_AUTH=$(printf "INSERT INTO users (id,email,name,password_hash,role,status,tenant_id,updated_at) VALUES ('%s','%s','Super Administrateur','%s','SUPER_ADMIN'::\"UserRole\",'ACTIVE'::\"UserStatus\",'platform',NOW()) ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, updated_at=NOW();" "$ADMIN_ID" "$ADMIN_EMAIL" "$ADMIN_HASH")
docker exec -e PGPASSWORD="$PGPASS" haccp-postgres psql -U "$PGUSER" -d haccp_auth -c "$SQL_AUTH" || true

echo "=== Seeding superadmin into haccp_users ==="
SQL_USERS=$(printf "INSERT INTO users (id,email,name,role,status,tenant_id,updated_at) VALUES ('%s','%s','Super Administrateur','SUPER_ADMIN'::\"UserRole\",'ACTIVE'::\"UserStatus\",'platform',NOW()) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,role=EXCLUDED.role,status=EXCLUDED.status,updated_at=NOW();" "$ADMIN_ID" "$ADMIN_EMAIL")
docker exec -e PGPASSWORD="$PGPASS" haccp-postgres psql -U "$PGUSER" -d haccp_users -c "$SQL_USERS" || true

echo "=== Seeding platform tenant into haccp_tenants ==="
SQL_TENANT="INSERT INTO tenants (id,name,slug,status,plan,created_at,updated_at) VALUES ('platform','Platform Admin','platform','ACTIVE'::\"TenantStatus\",'enterprise',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;"
docker exec -e PGPASSWORD="$PGPASS" haccp-postgres psql -U "$PGUSER" -d haccp_tenants -c "$SQL_TENANT" || echo "haccp_tenants seed skipped"

echo "=== VERIFICATION: VITE_API_URL in JS bundle ==="
docker exec haccp-web sh -c \
  'grep -r "178\.105\.126\.165" /usr/share/nginx/html/assets/*.js 2>/dev/null | head -3 && echo "OK: URL baked in" || echo "WARNING: URL not found"'

echo "=== VERIFICATION: Login test on port 80 ==="
PASS="${SUPERADMIN_PASSWORD:-Admin@HACCP2024!}"
R80=$(curl -s -X POST http://localhost:80/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$PASS\"}")
echo "Port 80: $(echo "$R80" | cut -c1-60)"

echo "=== VERIFICATION: Gateway health ==="
curl -sf http://localhost/health | grep '"status":"ok"' || echo "WARNING: health check failed"

echo ""
echo "=========================================="
echo "=== DEPLOY COMPLETE — CHECK RESULTS ABOVE"
echo "=========================================="
