# ─── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/ ./packages/
COPY services/asset-service/package.json ./services/asset-service/

RUN pnpm install --frozen-lockfile

COPY services/asset-service/ ./services/asset-service/
COPY tsconfig.base.json ./

RUN pnpm --filter @haccp/asset-service build
RUN pnpm --filter @haccp/asset-service exec prisma generate

# ─── Stage 2: runner ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production SERVICE_NAME=asset-service

RUN npm install -g prisma@5.11.0 --no-audit --no-fund --quiet

COPY --from=builder /app/services/asset-service/dist         ./dist
COPY --from=builder /app/services/asset-service/prisma       ./prisma
COPY --from=builder /app/node_modules/.prisma                ./node_modules/.prisma
COPY --from=builder /app/services/asset-service/node_modules ./node_modules

EXPOSE 3014

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3014/health || exit 1

CMD ["sh", "-c", "prisma migrate deploy && exec node dist/main"]
