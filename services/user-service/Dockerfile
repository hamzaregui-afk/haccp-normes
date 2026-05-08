# ─── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/ ./packages/
COPY services/user-service/package.json ./services/user-service/

RUN pnpm install --frozen-lockfile

COPY services/user-service/ ./services/user-service/
COPY tsconfig.base.json ./

# Build shared packages first so their dist/ is available at runtime
RUN pnpm --filter @haccp/shared-types build \
 && pnpm --filter @haccp/shared-validators build \
 && pnpm --filter @haccp/shared-errors build \
 && pnpm --filter @haccp/shared-utils build

RUN pnpm --filter @haccp/user-service build
RUN pnpm --filter @haccp/user-service exec prisma generate

# ─── Stage 2: runner ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production SERVICE_NAME=user-service

RUN npm install -g prisma@5.11.0 --no-audit --no-fund --quiet

COPY --from=builder /app/services/user-service/dist         ./dist
COPY --from=builder /app/services/user-service/prisma       ./prisma
COPY --from=builder /app/node_modules/.prisma               ./node_modules/.prisma
COPY --from=builder /app/node_modules/.pnpm                 ./node_modules/.pnpm
COPY --from=builder /app/packages                           ./packages
COPY --from=builder /app/services/user-service/node_modules ./node_modules

EXPOSE 3011

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3011/health || exit 1

CMD ["sh", "-c", "prisma migrate deploy && exec node dist/main"]
