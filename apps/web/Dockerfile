# ─── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/ ./packages/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

COPY apps/web/ ./apps/web/
COPY tsconfig.base.json ./

# Build shared packages first — Vite resolves @haccp/* via package.json#main (dist/index.js)
# so the dist/ must exist before the web bundle is compiled
RUN pnpm --filter @haccp/shared-types build \
 && pnpm --filter @haccp/shared-validators build \
 && pnpm --filter @haccp/shared-errors build \
 && pnpm --filter @haccp/shared-utils build

RUN pnpm --filter @haccp/web build

# ─── Stage 2: runner (nginx) ──────────────────────────────────────────────────
FROM nginx:1.25-alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:80 || exit 1

CMD ["nginx", "-g", "daemon off;"]
