# ─── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/ ./packages/
COPY services/auth-service/package.json ./services/auth-service/

RUN pnpm install --frozen-lockfile

COPY services/auth-service/ ./services/auth-service/
COPY tsconfig.base.json ./

RUN pnpm --filter @haccp/auth-service build
RUN pnpm --filter @haccp/auth-service exec prisma generate

# ─── Stage 2: runner ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production SERVICE_NAME=auth-service

# Install prisma CLI so migrations run at container start (cached Docker layer)
RUN npm install -g prisma@5.11.0 --no-audit --no-fund --quiet

COPY --from=builder /app/services/auth-service/dist         ./dist
COPY --from=builder /app/services/auth-service/prisma       ./prisma
COPY --from=builder /app/node_modules/.prisma               ./node_modules/.prisma
COPY --from=builder /app/services/auth-service/node_modules ./node_modules

EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3010/health || exit 1

# ARCH-DECISION: Migrations run at container start so the DB is reachable.
# docker-compose depends_on: postgres: { condition: service_healthy } guarantees this.
# prisma migrate deploy is idempotent — already-applied migrations are skipped.
CMD ["sh", "-c", "prisma migrate deploy && exec node dist/main"]
