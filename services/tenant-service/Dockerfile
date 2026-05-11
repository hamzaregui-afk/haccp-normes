# â”€â”€â”€ Stage 1: builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
COPY services/tenant-service/package.json ./services/tenant-service/

RUN pnpm install --no-frozen-lockfile

COPY services/tenant-service/ ./services/tenant-service/
COPY tsconfig.base.json ./

# Build shared packages first so their dist/ is available at runtime
RUN pnpm --filter @haccp/shared-types build \
 && pnpm --filter @haccp/shared-validators build \
 && pnpm --filter @haccp/shared-errors build \
 && pnpm --filter @haccp/shared-utils build

RUN pnpm --filter @haccp/tenant-service exec prisma generate \
 && mkdir -p /app/node_modules/.prisma
RUN pnpm --filter @haccp/tenant-service build

# â”€â”€â”€ Stage 2: runner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production SERVICE_NAME=tenant-service

RUN apk add --no-cache openssl


COPY --from=builder /app/services/tenant-service/dist         ./dist
COPY --from=builder /app/services/tenant-service/prisma       ./prisma
COPY --from=builder /app/node_modules/.prisma                 ./node_modules/.prisma
COPY --from=builder /app/node_modules/.pnpm                   ./node_modules/.pnpm
COPY --from=builder /app/packages                             ./packages
COPY --from=builder /app/services/tenant-service/node_modules ./node_modules

EXPOSE 3018

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3018/health || exit 1

CMD ["sh", "-c", "/app/node_modules/.pnpm/node_modules/.bin/prisma migrate deploy && exec node dist/services/tenant-service/src/main"]
# ─── Stage 2: runner ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production SERVICE_NAME=tenant-service

RUN apk add --no-cache openssl

# ARCH-DECISION: Preserve the pnpm workspace hierarchy so relative symlinks
# in services/tenant-service/node_modules resolve correctly.
# symlink: services/tenant-service/node_modules/<pkg> -> ../../../node_modules/.pnpm/<pkg>/...
# With /app as root: ../../../ from services/tenant-service/node_modules/ goes to /app/
# so it correctly resolves to /app/node_modules/.pnpm/<pkg>/...
COPY --from=builder /app/node_modules/.prisma                    ./node_modules/.prisma
COPY --from=builder /app/node_modules/.pnpm                      ./node_modules/.pnpm
COPY --from=builder /app/packages                                ./packages
COPY --from=builder /app/services/tenant-service/node_modules  ./services/tenant-service/node_modules
COPY --from=builder /app/services/tenant-service/dist           ./services/tenant-service/dist
COPY --from=builder /app/services/tenant-service/prisma         ./services/tenant-service/prisma

EXPOSE 3018

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD wget -qO- http://localhost:3018/health || exit 1

CMD ["sh", "-c", "cd /app/services/tenant-service && /app/node_modules/.pnpm/node_modules/.bin/prisma migrate deploy && exec node /app/services/tenant-service/dist/services/tenant-service/src/main"]
