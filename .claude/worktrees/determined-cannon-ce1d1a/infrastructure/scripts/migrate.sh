#!/usr/bin/env bash
# Run Prisma migrations for all services that have a schema.prisma
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

SERVICES=(
  "auth-service"
  "user-service"
  "tenant-service"
  "control-service"
  "nonconformity-service"
  "asset-service"
  "notification-service"
  "report-service"
  "dlc-service"
  "audit-service"
)

for service in "${SERVICES[@]}"; do
  schema="$ROOT/services/$service/prisma/schema.prisma"
  if [ -f "$schema" ]; then
    echo "🗃️  Migrating $service..."
    (cd "$ROOT/services/$service" && pnpm prisma migrate deploy)
    echo "✅ $service migrated"
  else
    echo "⏭️  Skipping $service (no schema.prisma)"
  fi
done

echo "✅ All migrations complete"
