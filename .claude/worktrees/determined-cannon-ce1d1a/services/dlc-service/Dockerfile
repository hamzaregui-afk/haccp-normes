# ─── Stage 1: builder ───────────────────────────────────────────────────────────
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
COPY services/dlc-service/package.json ./services/dlc-service/

RUN pnpm install --no-frozen-lockfile

COPY services/dlc-service/ ./services/dlc-service/
COPY tsconfig.base.json ./

# Build shared packages first so dist/ exists for runtime resolution
RUN pnpm --filter @haccp/shared-types build \
 && pnpm --filter @haccp/shared-validators build \
 && pnpm --filter @haccp/shared-errors build \
 && pnpm --filter @haccp/shared-utils build

RUN pnpm --filter @haccp/dlc-service exec prisma generate \
 && mkdir -p /app/node_modules/.prisma
RUN pnpm --filter @haccp/dlc-service build

# ARCH-DECISION: TypeScript path aliases (paths config pointing to .ts source files)
# sometimes emit require("...something.ts") in compiled output instead of the alias name.
# Since tsc compiles packages into dist/ alongside the service, the compiled package files
# exist as .js but the require uses .ts extension. Fix with a post-build sed pass.
RUN find /app/services/dlc-service/dist -name "*.js" -print0 | \
    xargs -0 sed -i 's/\.ts")/\.js")/g' 2>/dev/null || true

# ─── Stage 2: runner ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production SERVICE_NAME=dlc-service

RUN apk add --no-cache openssl

# ARCH-DECISION: Preserve the pnpm workspace hierarchy so relative symlinks
# in services/dlc-service/node_modules resolve correctly.
# symlink: services/dlc-service/node_modules/<pkg> -> ../../../node_modules/.pnpm/<pkg>/...
# With /app as root: ../../../ from services/dlc-service/node_modules/ goes to /app/
# so it correctly resolves to /app/node_modules/.pnpm/<pkg>/...
COPY --from=builder /app/node_modules/.prisma                    ./node_modules/.prisma
COPY --from=builder /app/node_modules/.pnpm                      ./node_modules/.pnpm
COPY --from=builder /app/packages                                ./packages
COPY --from=builder /app/services/dlc-service/node_modules  ./services/dlc-service/node_modules
COPY --from=builder /app/services/dlc-service/dist           ./services/dlc-service/dist
COPY --from=builder /app/services/dlc-service/prisma         ./services/dlc-service/prisma

EXPOSE 3017

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD wget -qO- http://localhost:3017/health || exit 1

CMD ["sh", "-c", "cd /app/services/dlc-service && /app/node_modules/.pnpm/node_modules/.bin/prisma migrate deploy && exec node /app/services/dlc-service/dist/services/dlc-service/src/main"]
