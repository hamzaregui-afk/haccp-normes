# ─── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/ ./packages/
COPY services/notification-service/package.json ./services/notification-service/

RUN pnpm install --frozen-lockfile

COPY services/notification-service/ ./services/notification-service/
COPY tsconfig.base.json ./

RUN pnpm --filter @haccp/notification-service build
RUN pnpm --filter @haccp/notification-service exec prisma generate

# ─── Stage 2: runner ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production SERVICE_NAME=notification-service

RUN npm install -g prisma@5.11.0 --no-audit --no-fund --quiet

COPY --from=builder /app/services/notification-service/dist         ./dist
COPY --from=builder /app/services/notification-service/prisma       ./prisma
COPY --from=builder /app/node_modules/.prisma                       ./node_modules/.prisma
COPY --from=builder /app/services/notification-service/node_modules ./node_modules

EXPOSE 3015

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3015/health || exit 1

CMD ["sh", "-c", "prisma migrate deploy && exec node dist/main"]
