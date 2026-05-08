# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Identity

**Application Name:** NORMES HACCP
**Domain:** Food Safety & HACCP Compliance Management
**Architecture:** Microservices + Docker + Multi-tenant SaaS
**Language:** TypeScript (strict mode throughout)

### Brand Tokens
| Token | Value | Usage |
|---|---|---|
| `color.brand.dark` | `#1A3D2B` | Primary dark green — sidebars, headers |
| `color.brand.mid` | `#2D6A4F` | Medium green — CTAs, active states |
| `color.brand.gold` | `#B5833A` | Gold — warnings, highlights, premium |
| `color.brand.bg` | `#F5F5F0` | Light off-white — page background |
| `font.web` | `Inter` | All web surfaces |
| `font.mobile` | System font | React Native — no custom font loading |

Design tokens live in `apps/web/tailwind.config.ts` (web) and are consumed directly in React Native via inline style constants.

### Component Conventions (Web)
Every UI component must follow this pattern — no exceptions:
```ts
// 1. Props interface above the component
// 2. Variants as const Record (never inline ternaries)
// 3. Default export with display name

const ROLE_STYLES: Record<UserRole, string> = {
  SUPER_ADMIN:     'bg-purple-100 text-purple-800 border-purple-300',
  ADMIN:           'bg-brand-light text-brand-dark border-brand-medium',
  MANAGER:         'bg-orange-100 text-orange-800 border-orange-300',
  QUALITY_OFFICER: 'bg-purple-100 text-purple-800 border-purple-300',
  OPERATOR:        'bg-gray-100 text-gray-700 border-gray-300',
  VIEWER:          'bg-gray-100 text-gray-700 border-gray-300',
};

interface BadgeProps { role: UserRole; size?: 'sm' | 'md'; }
export function RoleBadge({ role, size = 'md' }: BadgeProps) { ... }
```

### Web Layout Structure
```
┌─────────────────────────────────────────────┐
│  SIDEBAR (280px fixed)  │  MAIN CONTENT      │
│  NORMES HACCP logo      │  Page Header       │
│  ─────────────────      │  ─────────────     │
│  OPÉRATIONS             │  Content Area      │
│    Vue d'ensemble       │                    │
│    Contrôle             │  Lang: FR ▾ (top)  │
│    Non-conformité       │                    │
│  GESTION ACTIFS         │                    │
│    Produits             │                    │
│    Équipements          │                    │
│    Fournisseurs         │                    │
│  ÉQUIPE                 │                    │
│    Utilisateurs         │                    │
│    Groupes              │                    │
│  ADMINISTRATION         │                    │
│    Rapports             │                    │
│    Paramètres           │                    │
│  ─────────────────      │                    │
│  [avatar] User          │                    │
│  Role badge / Logout    │                    │
└─────────────────────────────────────────────┘
```

---

## Mandatory Behavioral Rules

These rules apply to **every task without exception**.

### Rule 1 — Think Before You Code
Before implementing any feature, output a plan in this exact format:
```
## 📋 Implementation Plan
- What I'm building: [feature]
- Files to create/modify: [list]
- Dependencies needed: [list]
- Potential risks: [list]
- Estimated complexity: [LOW | MEDIUM | HIGH]
```

### Rule 2 — File Structure First
Always place files in the correct monorepo directory. If a directory doesn't exist, create it with a correct `index.ts` barrel file before writing implementation code.

### Rule 3 — TypeScript Strict Mode Always
Every file must pass `tsc --strict --noEmit`. No `any`. No `@ts-ignore`. Use `unknown` + type guards where the type is genuinely unknown.

### Rule 4 — Test-Driven Order of Operations
For every service, controller, or utility:
1. Write the interface/type
2. Write the test skeleton
3. Write the implementation
4. Confirm the test passes mentally before moving on

### Rule 5 — Security by Default
- Secrets via `process.env.VARIABLE_NAME` validated by a Zod `.env` schema — never hardcoded
- All user input validated by Zod schemas at the API boundary before any business logic
- Standardized error responses — never expose internal error details or stack traces
- Every protected endpoint must have `@Roles(...)` + `@UseGuards(JwtAuthGuard, RolesGuard)`

### Rule 6 — Commit After Each Logical Unit
After completing a full service, component, or migration, emit:
```bash
git add .
git commit -m "feat(scope): description"  # Conventional Commits
```

### Rule 7 — Docker-First Mindset
Every service must ship with:
- A `Dockerfile` using a **multi-stage build** (`builder` → `runner` stages) — never a single-stage image
- A `GET /health` endpoint returning `{ status: "ok", uptime: number, version: string }`
- A `.env.example` listing every required environment variable with a description comment
- An entry in the root `docker-compose.yml` with a `healthcheck` block

No service is considered "done" until all four exist.

### Rule 8 — Never Break Existing Code
Before modifying any file: read its full content first.
Before adding any dependency: check if it is already installed (`grep` the relevant `package.json`).
Before changing a shared package (`packages/shared-types`, `packages/config`, etc.): trace every import of that package across the monorepo and assess the blast radius.

### Rule 10 — Progress Tracking
After completing each major task, output:
```
✅ COMPLETED: [task name]
📁 Files created: [list]
🧪 Tests: [passing/pending]
🔗 Next task: [what to do next]
```

### Rule 9 — Explain Architectural Decisions
Any non-obvious decision must be annotated inline at the point of use:
```ts
// ARCH-DECISION: Using Redis pub/sub here instead of direct WebSocket emit
// because notification-service is stateless and can run as multiple replicas.
// Each replica subscribes to the same Redis channel, ensuring all clients
// connected to any replica receive the event without coordination overhead.
```
Triggers: choice of transport (Redis vs in-memory vs NATS), schema design (why a column is nullable, why a join table exists), caching strategy, any deviation from the patterns in this file.

---

## Monorepo Structure

```
apps/
  web/            # React 18 + Vite — web dashboard
  mobile/         # React Native (Expo) — field operator app
  api-gateway/    # BFF / reverse proxy — the ONLY entry point for clients
services/
  auth/           # JWT issuance + RBAC
  hazards/        # Hazard catalog & risk matrix
  ccp/            # Critical Control Points lifecycle
  monitoring/     # Real-time sensor & checkpoint data
  audit/          # Immutable append-only audit log (write-once, by law)
  notifications/  # Alerts & escalations
packages/
  shared-types/   # Zod schemas + inferred TS types — single source of truth
  shared-ui/      # Design system (web components + brand tokens)
  config/         # Shared ESLint, TSConfig, Jest presets
infra/
  docker/         # Per-service Dockerfiles
  k8s/            # Kubernetes manifests
  terraform/      # Cloud provisioning
```

**Golden rule:** all API shapes, domain entities, and event payloads are Zod schemas in `packages/shared-types`. TS types are `z.infer<typeof Schema>` — never written by hand. Never duplicate types across services.

---

## Common Commands

Run from the **monorepo root** unless noted.

```bash
# Dependencies
pnpm install

# Build
pnpm build                            # all workspaces
pnpm --filter apps/web build         # single workspace

# Dev servers (each in its own terminal)
pnpm --filter apps/web dev
pnpm --filter apps/mobile dev
pnpm --filter services/auth dev

# Type-check (must pass before any commit)
pnpm typecheck

# Lint
pnpm lint                             # all
pnpm --filter services/hazards lint  # single service

# Tests
pnpm test                             # all
pnpm --filter services/ccp test      # single service
npx jest path/to/file.test.ts        # single file
npx jest -t "should flag hazard"     # single test by name

# Docker local stack
docker compose up --build            # start everything
docker compose up auth hazards       # start subset
docker compose down -v               # teardown + wipe volumes
```

---

## Architecture Decisions

### Multi-tenant SaaS
Every database table includes a `tenant_id` column. Every service query must be scoped to `tenant_id` derived from the validated JWT. Leaking cross-tenant data is a critical security failure.

### Functional-First Style
- Prefer pure functions and pipeline composition (`pipe`, `flow` — use `fp-ts` or native chaining).
- Domain logic must be side-effect free. Push I/O (DB, HTTP, queues) to the edges.
- Use `Result`/`Either` for error handling in domain code — avoid throwing in business logic.

### Inter-Service Communication
- **Sync:** REST or tRPC (prefer tRPC for internal service-to-service calls for full type-safety).
- **Async:** Redis Streams or NATS. Event naming: `<domain>.<entity>.<past-tense>` (e.g., `monitoring.checkpoint.recorded`).

### Auth & RBAC
JWT is issued only by the `auth` service. All other services validate tokens via shared middleware from `packages/config`. Roles: `admin`, `supervisor`, `operator`, `auditor`. The `auditor` role is read-only everywhere.

### Database Ownership
Each service owns its own PostgreSQL database. No cross-service DB joins — ever. Migrations live in `services/<name>/src/db/migrations/` and run via `drizzle-kit`.

### Client ↔ Backend
Web and mobile apps call **only** `api-gateway`. No direct microservice calls from clients.

### Audit Log
The `audit` service is **append-only**. No `UPDATE` or `DELETE` SQL ever runs against its tables. This is a legal/regulatory requirement. Any attempt to modify this constraint must be flagged immediately.

---

## Testing Strategy

| Layer | Tool | Convention |
|---|---|---|
| Unit | Jest | `src/**/*.test.ts` |
| Integration | Jest + Testcontainers | `src/**/*.integration.test.ts` — requires Docker |
| E2E (web) | Playwright | `apps/web/e2e/` |
| E2E (mobile) | Detox | `apps/mobile/e2e/` |
| Contract | Pact | `services/*/src/contracts/` |

---

## Environment Variables

Every service has a `src/config/env.ts` file that exports a validated env object:

```ts
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  // ...
});

export const env = envSchema.parse(process.env);
```

The app must crash at startup with a clear message if env validation fails. Never call `process.env` directly outside of `env.ts`.

---

## RBAC Matrix

Implement this exactly — enforce at guard level, not just UI:

| Feature | SUPER_ADMIN | ADMIN | MANAGER | QUALITY_OFFICER | VIEWER | OPERATOR |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Clients (tenants) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Users: view | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Users: create/edit | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Groups: manage | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Controls: view | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Controls: plan/edit | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Controls: execute (mobile) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| NC: view | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| NC: create | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (mobile) |
| NC: close | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Products/Equipments/Suppliers: manage | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Reports: view | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Reports: generate/validate | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Settings/PMS | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| DLC print (mobile) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## API Patterns

### Standard Response Format
All services return this shape — never raw Prisma objects:
```ts
interface ApiResponse<T> {
  data:     T;
  meta?:    PaginationMeta;
  message?: string;
}
interface PaginationMeta { total: number; page: number; limit: number; lastPage: number; }
interface ApiError { statusCode: number; error: string; message: string; timestamp: string; path: string; }
```

### Tenant Isolation — mandatory on every service method
```ts
// ❌ NEVER:
async findAll() { return this.prisma.product.findMany(); }

// ✅ ALWAYS:
async findAll(tenantId: string) {
  return this.prisma.product.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
}
```

### NestJS Controller Pattern
```ts
@Get()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
async findAll(@CurrentUser() user: JwtPayload) {
  return this.service.findAll(user.tenantId); // tenantId always from JWT, never from body/query
}
```

---

## Infrastructure Stack

| Service | Port | Purpose |
|---|---|---|
| api-gateway (nginx) | 80 / 8080 | Single entry point — routes to all services |
| auth-service | 3010 | JWT issuance + refresh + RBAC |
| user-service | 3011 | User CRUD, invitations, groups |
| control-service | 3012 | CCP templates + task scheduling |
| nonconformity-service | 3013 | NC lifecycle + photos |
| asset-service | 3014 | Products, equipments, suppliers |
| notification-service | 3015 | Email + push + WebSocket (Socket.io) |
| report-service | 3016 | PDF generation + validation workflow |
| dlc-service | 3017 | DLC calculation + Bluetooth label print |
| tenant-service | 3018 | Tenant/client management (SUPER_ADMIN) |
| audit-service | 3019 | Append-only audit log |
| PostgreSQL | 5432 | Shared instance, separate DB per service |
| Redis | 6379 | Session cache + Socket.io adapter |
| RabbitMQ | 5672 / 15672 | Async inter-service events |
| MinIO | 9000 / 9001 | S3-compatible object storage (photos, PDFs) |
| Prometheus | 9090 | Metrics scraping |
| Grafana | 3030 | Dashboards |

### Async Event Naming
RabbitMQ exchanges follow: `<domain>.<entity>.<past-tense>`
- `control.task.completed` → triggers audit log + notification
- `nonconformity.nc.created` → triggers notification
- `report.report.validated` → triggers email send

---

## Implementation Phases

| Phase | Scope | Target |
|---|---|---|
| **0** | Monorepo + CI + shared-types + docker-compose | Day 1 |
| **1** | auth + user + tenant services, web login + sidebar + /users + /clients | Week 1–2 |
| **2** | asset-service, web /products /equipments /suppliers /groups | Week 3 |
| **3** | control-service, web /controls + 4 KPI cards, mobile agenda + checklist | Week 4–5 |
| **4** | nonconformity-service, web /nonconformities, mobile NC form, WebSocket | Week 6 |
| **5** | report-service + dlc-service, web /reports, mobile DLC print | Week 7–8 |
| **6** | Dashboard charts, i18n FR/EN/AR, audit logging, monitoring | Week 9 |

---

## Key Domain Concepts

| Term | Meaning |
|---|---|
| **Hazard** | Biological, chemical, or physical risk in a production process |
| **CCP** | Critical Control Point — a process step where a control measure is applied |
| **Critical Limit** | The boundary value a CCP measurement must not cross |
| **Corrective Action** | Required steps when a CCP measurement breaches its critical limit |
| **Verification** | Periodic confirmation that the HACCP plan is operating effectively |
| **Audit Log** | Immutable, append-only record of all system events (regulatory requirement) |
| **Tenant** | An independent food-business organization using the SaaS platform |
