#!/usr/bin/env bash
# Seed demo data (development only)
set -euo pipefail

if [ "${NODE_ENV:-development}" = "production" ]; then
  echo "❌ Seed must not run in production"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "🌱 Seeding demo data..."
psql "${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/haccp_auth}" \
  -f "$ROOT/infrastructure/postgres/seed.sql"
echo "✅ Seed complete"
