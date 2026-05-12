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
COPY services/audit-service/package.json ./services/audit-service/

RUN pnpm install --no-frozen-lockfile

COPY services/audit-service/ ./services/audit-service/
COPY tsconfig.base.json ./

# Build shared packages first so their dist/ is available at runtime
RUN pnpm --filter @haccp/shared-types build \
 && pnpm --filter @haccp/shared-validators build \
 && pnpm --filter @haccp/shared-errors build \
 && pnpm --filter @haccp/shared-utils build

RUN pnpm --filter @haccp/audit-service exec prisma generate \
 && mkdir -p /app/node_modules/.prisma
RUN pnpm --filter @haccp/audit-service build

# â”€â”€â”€ Stage 2: runner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production SERVICE_NAME=audit-service

RUN apk add --no-cache openssl


COPY --from=builder /app/services/audit-service/dist         ./dist
COPY --from=builder /app/services/audit-service/prisma       ./prisma
COPY --from=builder /app/node_modules/.prisma                ./node_modules/.prisma
COPY --from=builder /app/node_modules/.pnpm                  ./node_modules/.pnpm
COPY --from=builder /app/packages                            ./packages
COPY --from=builder /app/services/audit-service/node_modules ./node_modules

EXPOSE 3019

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3019/health || exit 1

CMD ["sh", "-c", "/app/node_modules/.pnpm/node_modules/.bin/prisma migrate deploy && exec node dist/services/audit-service/src/main"]
# ─── Stage 2: runner ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production SERVICE_NAME=audit-service

RUN apk add --no-cache openssl

# ARCH-DECISION: Preserve the pnpm workspace hierarchy so relative symlinks
# in services/audit-service/node_modules resolve correctly.
# symlink: services/audit-service/node_modules/<pkg> -> ../../../node_modules/.pnpm/<pkg>/...
# With /app as root: ../../../ from services/audit-service/node_modules/ goes to /app/
# so it correctly resolves to /app/node_modules/.pnpm/<pkg>/...
COPY --from=builder /app/node_modules/.prisma                    ./node_modules/.prisma
COPY --from=builder /app/node_modules/.pnpm                      ./node_modules/.pnpm
COPY --from=builder /app/packages                                ./packages
COPY --from=builder /app/services/audit-service/node_modules  ./services/audit-service/node_modules
COPY --from=builder /app/services/audit-service/dist           ./services/audit-service/dist
COPY --from=builder /app/services/audit-service/prisma         ./services/audit-service/prisma

EXPOSE 3019

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD wget -qO- http://localhost:3019/health || exit 1

CMD ["sh", "-c", "cd /app/services/audit-service && /app/node_modules/.pnpm/node_modules/.bin/prisma migrate deploy && exec node /app/services/audit-service/dist/services/audit-service/src/main"]
