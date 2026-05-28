# ─── Stage 1: builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm config set fetch-retries 5 \
 && pnpm config set network-timeout 300000 \
 && pnpm config set fetch-retries 5
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/ ./packages/
COPY services/tracability-service/package.json ./services/tracability-service/

RUN pnpm install --no-frozen-lockfile

COPY services/tracability-service/ ./services/tracability-service/
COPY tsconfig.base.json ./

# Build shared packages first so their dist/ is available at runtime
RUN pnpm --filter @haccp/shared-types build \
 && pnpm --filter @haccp/shared-validators build \
 && pnpm --filter @haccp/shared-errors build \
 && pnpm --filter @haccp/shared-utils build

RUN pnpm --filter @haccp/tracability-service exec prisma generate \
 && mkdir -p /app/node_modules/.prisma
RUN pnpm --filter @haccp/tracability-service build

# ─── Stage 2: runner ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production SERVICE_NAME=tracability-service

RUN apk add --no-cache openssl

# ARCH-DECISION: Preserve the pnpm workspace hierarchy so relative symlinks
# in services/tracability-service/node_modules resolve correctly.
COPY --from=builder /app/node_modules/.prisma                        ./node_modules/.prisma
COPY --from=builder /app/node_modules/.pnpm                          ./node_modules/.pnpm
COPY --from=builder /app/packages                                     ./packages
COPY --from=builder /app/services/tracability-service/node_modules   ./services/tracability-service/node_modules
COPY --from=builder /app/services/tracability-service/dist           ./services/tracability-service/dist
COPY --from=builder /app/services/tracability-service/prisma         ./services/tracability-service/prisma

EXPOSE 3020

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD wget -qO- http://localhost:3020/health || exit 1

CMD ["sh", "-c", "cd /app/services/tracability-service && /app/node_modules/.pnpm/node_modules/.bin/prisma migrate deploy && exec node /app/services/tracability-service/dist/services/tracability-service/src/main"]
