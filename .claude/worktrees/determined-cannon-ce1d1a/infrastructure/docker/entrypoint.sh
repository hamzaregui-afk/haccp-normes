#!/bin/sh
# docker-entrypoint.sh — shared by all HACCP microservices.
# Runs Prisma migrations then hands off to the Node process.
#
# ARCH-DECISION: Running migrations at container start (not build time) ensures
# the DB is reachable before we attempt DDL. docker-compose `depends_on` with
# `condition: service_healthy` guarantees PostgreSQL is up, so this is safe.
# The migration is idempotent — Prisma skips already-applied migrations.
set -e

echo "▶ Running Prisma migrations (service: ${SERVICE_NAME:-unknown})…"
npx prisma migrate deploy

echo "✅ Migrations applied — starting Node process"
exec node dist/main
