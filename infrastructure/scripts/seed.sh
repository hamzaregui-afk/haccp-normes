#!/usr/bin/env bash
# Seed demo data (development only).
# Delegates to seed.js which connects to each DB separately (PostgreSQL cannot
# query across databases — cross-schema dot-notation only works within one DB).
set -euo pipefail

if [ "${NODE_ENV:-development}" = "production" ]; then
  echo "❌  Seed must not run in production"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "🌱  Starting demo seed..."
node "$ROOT/infrastructure/scripts/seed.js"
