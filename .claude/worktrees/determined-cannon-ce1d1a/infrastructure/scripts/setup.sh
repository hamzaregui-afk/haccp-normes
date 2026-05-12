#!/usr/bin/env bash
# One-command dev environment setup
set -euo pipefail

echo "🚀 Setting up NORMES HACCP dev environment..."

# Check prerequisites
command -v node  >/dev/null 2>&1 || { echo "❌ Node.js 20+ required"; exit 1; }
command -v pnpm  >/dev/null 2>&1 || { echo "❌ pnpm required: npm install -g pnpm"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker required"; exit 1; }

# Copy .env files if missing
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "✅ Root .env created from .env.example — fill in secrets before running"
fi

for service in auth-service user-service tenant-service control-service \
               nonconformity-service asset-service notification-service \
               report-service dlc-service audit-service; do
  envfile="$ROOT/services/$service/.env"
  if [ ! -f "$envfile" ]; then
    cp "$ROOT/services/$service/.env.example" "$envfile"
    echo "✅ $service/.env created"
  fi
done

# Install dependencies
echo "📦 Installing dependencies..."
cd "$ROOT" && pnpm install

# Start infrastructure containers
echo "🐳 Starting postgres + redis..."
cd "$ROOT/infrastructure/docker"
docker compose up -d postgres redis
echo "⏳ Waiting for postgres..."
sleep 5

# Run migrations
echo "🗃️  Running migrations..."
"$ROOT/infrastructure/scripts/migrate.sh"

echo ""
echo "✅ Setup complete!"
echo "   Start services: pnpm dev"
echo "   Full stack:     cd infrastructure/docker && docker compose up --build"
