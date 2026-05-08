#!/usr/bin/env bash
# ─── HACCP — Local dev startup ────────────────────────────────────────────────
# Usage: bash infrastructure/scripts/dev-start.sh
# Requires: Docker, Node 20+, pnpm

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NORMES HACCP — Dev environment startup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Install dependencies ──────────────────────────────────────────────────
echo ""
echo "▶ 1/4  Installing dependencies…"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# ── 2. Start infrastructure (Postgres, Redis, MinIO) ─────────────────────────
echo ""
echo "▶ 2/4  Starting infrastructure containers (postgres, redis, minio)…"
docker compose -f infrastructure/docker/docker-compose.yml \
  up -d postgres redis minio rabbitmq

echo "   Waiting for Postgres to be ready…"
until docker compose -f infrastructure/docker/docker-compose.yml \
  exec -T postgres pg_isready -U postgres -q 2>/dev/null; do
  sleep 1
done
echo "   ✅ Postgres ready"

# ── 3. Run Prisma migrations for all services ─────────────────────────────────
echo ""
echo "▶ 3/4  Running Prisma migrations…"

SERVICES=(
  auth-service
  user-service
  tenant-service
  asset-service
  control-service
  nonconformity-service
  report-service
  audit-service
  dlc-service
  notification-service
)

for svc in "${SERVICES[@]}"; do
  svc_path="services/$svc"
  if [ -f "$svc_path/prisma/schema.prisma" ]; then
    echo "   → $svc"
    (cd "$svc_path" && pnpm exec prisma migrate deploy 2>/dev/null \
      || pnpm exec prisma db push --skip-generate 2>/dev/null \
      || echo "     ⚠ Migration skipped (check .env & DB connection)")
  fi
done

# ── 4. Start all services ─────────────────────────────────────────────────────
echo ""
echo "▶ 4/4  Starting all NestJS services + web dev server…"
echo "   Services will start in parallel. Logs are in separate terminals."
echo ""

start_service() {
  local name=$1
  local path=$2
  echo "   → Starting $name (logs: /tmp/haccp-${name}.log)"
  pnpm --filter "@haccp/$name" dev > "/tmp/haccp-${name}.log" 2>&1 &
  echo $! > "/tmp/haccp-${name}.pid"
}

start_service "auth-service"            "services/auth-service"
start_service "user-service"            "services/user-service"
start_service "tenant-service"          "services/tenant-service"
start_service "asset-service"           "services/asset-service"
start_service "control-service"         "services/control-service"
start_service "nonconformity-service"   "services/nonconformity-service"
start_service "report-service"          "services/report-service"
start_service "audit-service"           "services/audit-service"
start_service "dlc-service"             "services/dlc-service"
start_service "notification-service"    "services/notification-service"

# Web — run in foreground so the terminal shows Vite output
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ All services started in background"
echo "  🌐 Starting web dev server…"
echo "  📋 Service logs: /tmp/haccp-<service>.log"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

pnpm --filter "@haccp/web" dev
