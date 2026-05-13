#!/bin/bash
# deploy.sh — Déploiement production NORMES HACCP
#
# RÈGLE ABSOLUE : CE SCRIPT NE SUPPRIME JAMAIS DE DONNÉES.
#   ✅ Seul le(s) service(s) dont le code a changé sont redémarrés.
#   ✅ PostgreSQL, Redis, RabbitMQ, MinIO ne sont JAMAIS touchés.
#   ✅ Aucun "docker compose down", aucun "-v", aucun "--force-recreate".
#   ✅ Le seed de référence est toujours rejoué en fin (idempotent).
#
# Usage :
#   bash /opt/haccp/scripts/deploy.sh          # auto-détecte les services modifiés
#   bash /opt/haccp/scripts/deploy.sh web      # force uniquement le service web
#   bash /opt/haccp/scripts/deploy.sh web auth-service user-service

set -euo pipefail
cd /opt/haccp

# ─── Services d'infrastructure (JAMAIS redémarrés par ce script) ──────────────
INFRA_SERVICES="postgres redis rabbitmq minio prometheus grafana"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   NORMES HACCP — Déploiement production             ║"
echo "║   ⚠️  Aucune donnée ne sera supprimée               ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── 1. Git pull ────────────────────────────────────────────────────────────────
echo "▶ [1/4] Git pull (branche main)..."
git pull origin main

# ── 2. Détecter les services à redémarrer ─────────────────────────────────────
echo "▶ [2/4] Détection des services modifiés..."

# Si des services sont passés en argument, les utiliser directement
if [ $# -gt 0 ]; then
  SERVICES_TO_UPDATE="$*"
  echo "   Services forcés : $SERVICES_TO_UPDATE"
else
  # Auto-détection basée sur les fichiers modifiés dans git
  CHANGED=$(git diff HEAD~1 --name-only 2>/dev/null || git diff --name-only HEAD 2>/dev/null || echo "apps/web")
  SERVICES_TO_UPDATE=""

  echo "$CHANGED" | grep -q "^apps/web/"             && SERVICES_TO_UPDATE="$SERVICES_TO_UPDATE web"
  echo "$CHANGED" | grep -q "^apps/api-gateway/"     && SERVICES_TO_UPDATE="$SERVICES_TO_UPDATE api-gateway"
  echo "$CHANGED" | grep -q "^services/auth"         && SERVICES_TO_UPDATE="$SERVICES_TO_UPDATE auth-service"
  echo "$CHANGED" | grep -q "^services/user"         && SERVICES_TO_UPDATE="$SERVICES_TO_UPDATE user-service"
  echo "$CHANGED" | grep -q "^services/control"      && SERVICES_TO_UPDATE="$SERVICES_TO_UPDATE control-service"
  echo "$CHANGED" | grep -q "^services/tenant"       && SERVICES_TO_UPDATE="$SERVICES_TO_UPDATE tenant-service"
  echo "$CHANGED" | grep -q "^services/asset"        && SERVICES_TO_UPDATE="$SERVICES_TO_UPDATE asset-service"
  echo "$CHANGED" | grep -q "^services/nonconformity" && SERVICES_TO_UPDATE="$SERVICES_TO_UPDATE nonconformity-service"
  echo "$CHANGED" | grep -q "^services/report"       && SERVICES_TO_UPDATE="$SERVICES_TO_UPDATE report-service"
  echo "$CHANGED" | grep -q "^services/dlc"          && SERVICES_TO_UPDATE="$SERVICES_TO_UPDATE dlc-service"
  echo "$CHANGED" | grep -q "^services/notification" && SERVICES_TO_UPDATE="$SERVICES_TO_UPDATE notification-service"
  echo "$CHANGED" | grep -q "^services/audit"        && SERVICES_TO_UPDATE="$SERVICES_TO_UPDATE audit-service"
  echo "$CHANGED" | grep -q "^packages/"             && SERVICES_TO_UPDATE="web auth-service user-service control-service tenant-service asset-service nonconformity-service"

  # Fallback : si rien détecté, relancer uniquement web
  if [ -z "$(echo $SERVICES_TO_UPDATE | tr -d ' ')" ]; then
    SERVICES_TO_UPDATE="web"
  fi

  # Dédoublonnage
  SERVICES_TO_UPDATE=$(echo "$SERVICES_TO_UPDATE" | tr ' ' '\n' | sort -u | tr '\n' ' ' | xargs)
  echo "   Services détectés : $SERVICES_TO_UPDATE"
fi

# Vérification de sécurité — ne jamais toucher l'infra
for svc in $SERVICES_TO_UPDATE; do
  if echo "$INFRA_SERVICES" | grep -qw "$svc"; then
    echo "   ⛔ REFUS : '$svc' est un service d'infrastructure. Non redémarré."
    SERVICES_TO_UPDATE=$(echo "$SERVICES_TO_UPDATE" | sed "s/$svc//g" | xargs)
  fi
done

# ── 3. Build + restart des services modifiés uniquement ───────────────────────
echo "▶ [3/4] Build + restart : $SERVICES_TO_UPDATE"
for svc in $SERVICES_TO_UPDATE; do
  echo "   → Build $svc..."
  docker compose build "$svc"

  echo "   → Restart $svc..."
  # Suppression propre du conteneur existant avant recréation
  CONTAINER_NAME="haccp-${svc}"
  docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
  docker compose up -d "$svc"

  echo "   ✅ $svc redémarré"
done

# ── 4. Seed de données de référence (idempotent — ne supprime rien) ───────────
echo "▶ [4/4] Seed de données de référence..."
until docker exec haccp-postgres pg_isready -U haccp_prod -q 2>/dev/null; do
  echo "   Attente PostgreSQL..."; sleep 2
done
bash /opt/haccp/scripts/run_seed.sh

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   ✅  Déploiement terminé — données préservées      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Résumé des conteneurs actifs
docker compose ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null | grep -v "^$" || docker ps --format "table {{.Names}}\t{{.Status}}"
