#!/bin/bash
# deploy.sh — Déploiement production NORMES HACCP
#
# Ce script :
#   1. Pull le dernier code depuis GitHub (branche main)
#   2. Rebuild les images Docker modifiées
#   3. Redémarre les services
#   4. Injecte le seed de référence (idempotent — ne supprime JAMAIS de données)
#
# Usage : bash /opt/haccp/scripts/deploy.sh
#
# ⚠️  Ne jamais utiliser "docker compose down -v" — cela supprime les volumes DB.

set -e
cd /opt/haccp

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   NORMES HACCP — Déploiement production             ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── 1. Pull du code ────────────────────────────────────────────────────────────
echo "▶ [1/4] Git pull (branche main)..."
git pull origin main

# ── 2. Build des images ────────────────────────────────────────────────────────
echo "▶ [2/4] Build Docker..."
docker compose build

# ── 3. Restart des services (sans toucher aux volumes) ────────────────────────
echo "▶ [3/4] Restart services..."
# On redémarre service par service pour éviter les conflits de noms
for svc in web api-gateway auth-service user-service control-service tenant-service asset-service nonconformity-service report-service dlc-service notification-service; do
  if docker compose config --services | grep -q "^${svc}$"; then
    docker rm -f "haccp-${svc}" 2>/dev/null || true
  fi
done
docker compose up -d

# ── 4. Seed de données de référence ───────────────────────────────────────────
echo "▶ [4/4] Seed de données de référence..."
# Attendre que PostgreSQL soit prêt
echo "   Attente PostgreSQL..."
until docker exec haccp-postgres pg_isready -U haccp_prod -q; do
  sleep 2
done
echo "   PostgreSQL prêt."
bash /opt/haccp/scripts/run_seed.sh

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║        ✅  Déploiement terminé avec succès          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
docker compose ps
