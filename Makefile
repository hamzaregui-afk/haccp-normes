# ─── NORMES HACCP — Developer Makefile ──────────────────────────────────────
# Usage: make <target>
# All targets can be run from the monorepo root.

.PHONY: help dev build test lint typecheck \
        docker-up docker-down docker-logs docker-reset \
        migrate seed \
        deploy-ec2

# ─── Default target ───────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  NORMES HACCP — Available commands"
	@echo ""
	@echo "  Dev"
	@echo "    make dev          Start all services locally (Docker)"
	@echo "    make dev-web      Start only the web app (Vite dev server)"
	@echo "    make dev-mobile   Start the Expo mobile dev server"
	@echo ""
	@echo "  Build & Quality"
	@echo "    make build        Build all workspaces"
	@echo "    make typecheck    Run tsc --noEmit on all packages"
	@echo "    make lint         Run ESLint across the monorepo"
	@echo "    make test         Run all Jest unit tests"
	@echo ""
	@echo "  Docker"
	@echo "    make docker-up    Start the full Docker stack"
	@echo "    make docker-down  Stop and remove containers"
	@echo "    make docker-logs  Follow logs from all containers"
	@echo "    make docker-reset Wipe volumes and restart from scratch"
	@echo ""
	@echo "  Database"
	@echo "    make migrate      Run Prisma migrations for all services"
	@echo "    make seed         Seed demo data"
	@echo ""
	@echo "  Deployment"
	@echo "    make deploy-ec2   Push and restart on EC2 (requires SSH_HOST)"
	@echo ""

# ─── Development ─────────────────────────────────────────────────────────────
dev: docker-up

dev-web:
	pnpm --filter apps/web dev

dev-mobile:
	pnpm --filter apps/mobile start

# ─── Build ────────────────────────────────────────────────────────────────────
build:
	pnpm build

typecheck:
	pnpm typecheck

lint:
	pnpm lint

test:
	pnpm test

# ─── Docker ───────────────────────────────────────────────────────────────────
docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f --tail=100

docker-reset:
	docker compose down -v
	docker compose up -d --build
	@echo "Waiting 15s for services to initialize…"
	@sleep 15
	$(MAKE) migrate

# ─── Database ─────────────────────────────────────────────────────────────────
migrate:
	bash infrastructure/scripts/migrate.sh

seed:
	bash infrastructure/scripts/seed.sh

# ─── Deployment (EC2) ─────────────────────────────────────────────────────────
# Usage: make deploy-ec2 SSH_HOST=ubuntu@<EC2_IP>
SSH_HOST ?= ubuntu@your-ec2-ip

deploy-ec2:
	@echo "Deploying to $(SSH_HOST)…"
	ssh $(SSH_HOST) "cd /opt/haccp && git pull && docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build"
	ssh $(SSH_HOST) "cd /opt/haccp && bash infrastructure/scripts/migrate.sh"
	@echo "✅ Deploy complete — check logs with: make logs-ec2 SSH_HOST=$(SSH_HOST)"

logs-ec2:
	ssh $(SSH_HOST) "docker compose -f /opt/haccp/docker-compose.yml logs -f --tail=50"
