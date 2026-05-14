# NORMES HACCP — Documentation Architecture & Technique

> **Version :** 1.0 — Mai 2026  
> **Statut :** Production  
> **Domaine :** Gestion de la sécurité alimentaire (SaaS Multi-tenant)

---

## Table des matières

1. [Vue d'ensemble du projet](#1-vue-densemble-du-projet)
2. [Structure du monorepo](#2-structure-du-monorepo)
3. [Architecture globale](#3-architecture-globale)
4. [Infrastructure & Services](#4-infrastructure--services)
5. [Base de données](#5-base-de-données)
6. [Backend — Microservices NestJS](#6-backend--microservices-nestjs)
7. [Frontend Web — React / Vite](#7-frontend-web--react--vite)
8. [Application Mobile — React Native / Expo](#8-application-mobile--react-native--expo)
9. [Communication Frontend ↔ Backend](#9-communication-frontend--backend)
10. [Communication Web App ↔ App Mobile](#10-communication-web-app--app-mobile)
11. [Communication inter-services (RabbitMQ)](#11-communication-inter-services-rabbitmq)
12. [Temps réel — WebSocket (Socket.io)](#12-temps-réel--websocket-socketio)
13. [Stockage de fichiers — MinIO](#13-stockage-de-fichiers--minio)
14. [Authentification & Autorisation (RBAC)](#14-authentification--autorisation-rbac)
15. [Monitoring & Observabilité](#15-monitoring--observabilité)
16. [Sécurité](#16-sécurité)
17. [Déploiement & CI/CD](#17-déploiement--cicd)
18. [Récapitulatif des outils & versions](#18-récapitulatif-des-outils--versions)

---

## 1. Vue d'ensemble du projet

**NORMES HACCP** est une plateforme SaaS multi-tenant de gestion de la sécurité alimentaire. Elle permet à des établissements de restauration et d'industrie agroalimentaire de :

- **Planifier et exécuter** des contrôles HACCP (températures, réceptions, équipements, hygiène)
- **Déclarer et gérer** les non-conformités avec photos et actions correctives
- **Tracer** les DLC (dates limite de consommation) et imprimer des étiquettes via Bluetooth
- **Générer** des rapports PDF validés, conformes aux exigences réglementaires
- **Auditer** toutes les actions utilisateurs dans un journal immuable (obligation légale)
- **Superviser** l'ensemble en temps réel depuis un tableau de bord web

### Modèle multi-tenant

Chaque organisation cliente (restaurant, cuisine centrale, etc.) est un **tenant** indépendant. Toutes les données sont isolées par `tenant_id` à chaque niveau :
- Colonne `tenant_id` dans chaque table de chaque base de données
- Filtre systématique dans chaque requête de service
- Le `tenant_id` provient **exclusivement** du JWT validé — jamais du body ou des query params

---

## 2. Structure du monorepo

Le projet est organisé en **monorepo pnpm** géré avec **Turborepo**.

```
normes-haccp/                          ← Racine du monorepo
│
├── apps/
│   ├── web/                           ← Dashboard React 18 (opérateurs bureau)
│   └── mobile/                        ← App React Native/Expo (opérateurs terrain)
│
├── services/
│   ├── auth-service/        :3010      ← JWT, refresh tokens, RBAC
│   ├── user-service/        :3011      ← Utilisateurs, invitations, groupes
│   ├── control-service/     :3012      ← Templates CCP, tâches, checklists
│   ├── nonconformity-service/ :3013    ← Non-conformités, photos, clôture
│   ├── asset-service/       :3014      ← Produits, équipements, fournisseurs, GED
│   ├── notification-service/ :3015     ← Email, push FCM, WebSocket
│   ├── report-service/      :3016      ← Génération PDF, workflow validation
│   ├── dlc-service/         :3017      ← Calcul DLC, impression Bluetooth
│   ├── tenant-service/      :3018      ← Gestion des clients/tenants
│   └── audit-service/       :3019      ← Journal immuable (append-only)
│
├── packages/
│   ├── shared-types/                   ← Schemas Zod + types TypeScript (source de vérité)
│   ├── shared-validators/              ← Validators Zod partagés
│   ├── shared-utils/                   ← Fonctions utilitaires
│   ├── shared-errors/                  ← Classes d'erreur standardisées
│   └── config/                         ← Presets ESLint, TSConfig, Jest
│
├── infrastructure/
│   ├── nginx/nginx.conf                ← API Gateway (reverse proxy)
│   ├── postgres/init.sql               ← Initialisation des 10 bases de données
│   ├── prometheus/prometheus.yml       ← Configuration scraping métriques
│   └── grafana/                        ← Dashboards et provisioning
│
├── scripts/
│   ├── deploy.sh                       ← Déploiement production (safe, sans suppression)
│   └── run_seed.sh                     ← Seed de données de référence (idempotent)
│
├── docker-compose.yml                  ← Stack complète (26 conteneurs)
├── turbo.json                          ← Pipeline Turborepo
├── pnpm-workspace.yaml                 ← Déclaration des workspaces
└── CLAUDE.md                           ← Instructions pour l'IA de développement
```

### Outil de build du monorepo

| Outil | Rôle |
|-------|------|
| **pnpm 9.0.0** | Gestionnaire de paquets, workspaces, déduplication |
| **Turborepo 2.0.0** | Orchestration des builds en parallèle, cache intelligent |
| **TypeScript 5.4.5** | Langage unique sur toute la stack (strict mode) |

---

## 3. Architecture globale

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                      │
│                                                                      │
│   ┌──────────────────┐              ┌──────────────────────────┐    │
│   │   Web App (React) │              │  Mobile App (RN/Expo)    │    │
│   │   Port 3001        │              │  iOS / Android            │    │
│   └────────┬─────────┘              └────────────┬─────────────┘    │
└────────────┼────────────────────────────────────┼───────────────────┘
             │  HTTPS / REST                        │  HTTPS / REST
             │  + WebSocket                         │  + Push (FCM)
             ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│              API GATEWAY — Nginx (Port 80)                           │
│   Rate limiting · GZIP · Routage · Timeouts · Healthchecks          │
└──┬────────┬────────┬────────┬────────┬────────┬────────┬────────┬──┘
   │        │        │        │        │        │        │        │
   ▼        ▼        ▼        ▼        ▼        ▼        ▼        ▼
:3010    :3011    :3012    :3013    :3014    :3015    :3016  :3017-3019
auth    users   control   NC     assets   notif   report   dlc/tenant/audit
   │        │        │        │        │        │        │        │
   └────────┴────────┴────────┴────────┴────────┴────────┴────────┘
                              │
                   ┌──────────┼──────────┐
                   ▼          ▼          ▼
             PostgreSQL     Redis    RabbitMQ
             (10 DBs)    (cache+WS)  (events)
                                        │
                   ┌────────────────────┘
                   ▼
             MinIO (S3)      Prometheus → Grafana
             (fichiers)      (métriques)
```

### Principes architecturaux

| Principe | Application |
|----------|-------------|
| **Un seul point d'entrée** | Tous les clients passent par Nginx — jamais directement aux services |
| **Isolation des données** | Chaque service a sa propre base PostgreSQL — zéro jointure cross-service |
| **Séparation sync/async** | REST pour les requêtes immédiates, RabbitMQ pour les événements différés |
| **Tenant-first** | `tenant_id` extrait du JWT, appliqué à chaque requête SQL |
| **Immuabilité de l'audit** | Le service audit ne fait jamais de UPDATE/DELETE (obligation légale) |

---

## 4. Infrastructure & Services

### 4.1 Conteneurs Docker

La stack complète tourne via **Docker Compose** (version 3.9) sur un réseau bridge `haccp-network` (MTU 1400 pour WSL2).

| Conteneur | Image | Port(s) | Volume persistant |
|-----------|-------|---------|-------------------|
| `haccp-gateway` | nginx:alpine | **80** | — |
| `haccp-web` | apps/web/Dockerfile | **3001** | — |
| `haccp-auth` | services/auth-service | **3010** | — |
| `haccp-users` | services/user-service | **3011** | — |
| `haccp-controls` | services/control-service | **3012** | — |
| `haccp-nc` | services/nonconformity-service | **3013** | — |
| `haccp-assets` | services/asset-service | **3014** | — |
| `haccp-notifications` | services/notification-service | **3015** | — |
| `haccp-reports` | services/report-service | **3016** | — |
| `haccp-dlc` | services/dlc-service | **3017** | — |
| `haccp-tenants` | services/tenant-service | **3018** | — |
| `haccp-audit` | services/audit-service | **3019** | — |
| `haccp-postgres` | postgres:15-alpine | 5433→5432 | `postgres-data` |
| `haccp-redis` | redis:7-alpine | **6379** | `redis-data` |
| `haccp-rabbitmq` | rabbitmq:3.12-management | 5672, 15672 | `rabbitmq-data` |
| `haccp-minio` | minio/minio:latest | 9000, 9001 | `minio-data` |
| `haccp-prometheus` | prom/prometheus:latest | **9090** | `prometheus-data` |
| `haccp-grafana` | grafana/grafana:10.4.0 | **3030** | `grafana-data` |

### 4.2 API Gateway — Nginx

Nginx est le **seul point d'entrée** pour tous les clients. Il assure :

- **Routage** des requêtes vers le bon microservice selon le préfixe d'URL
- **Rate limiting** : 100 req/s par IP (burst 200), réduit à 50 sur `/api/v1/auth`
- **GZIP** : compression automatique des réponses JSON/JS/CSS
- **Timeouts** : connect 10s, read/send 90s (PDF génération longue)
- **Body size** : 50MB global, 20MB sur les routes de fichiers
- **WebSocket** : upgrade HTTP → WS pour Socket.io sur `/socket.io`

```
Routes principales :
  /api/v1/auth          → auth-service:3010
  /api/v1/users         → user-service:3011
  /api/v1/groups        → user-service:3011
  /api/v1/controls      → control-service:3012
  /api/v1/nonconformities → nonconformity-service:3013
  /api/v1/products      → asset-service:3014
  /api/v1/equipments    → asset-service:3014
  /api/v1/suppliers     → asset-service:3014
  /api/v1/documents     → asset-service:3014
  /api/v1/notifications → notification-service:3015
  /api/v1/reports       → report-service:3016
  /api/v1/dlc           → dlc-service:3017
  /api/v1/tenants       → tenant-service:3018
  /api/v1/sites         → tenant-service:3018
  /api/v1/zones         → tenant-service:3018
  /api/v1/audit         → audit-service:3019
  /socket.io            → notification-service:3015 (WebSocket)
  /health               → 200 OK {"status":"ok"}
```

### 4.3 Dockerfiles — Multi-stage Build

Chaque microservice utilise un Dockerfile **multi-stage** obligatoire :

```dockerfile
# Stage 1 — Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2 — Runner (image finale légère)
FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3010
CMD ["node", "dist/main.js"]
```

---

## 5. Base de données

### 5.1 Moteur

**PostgreSQL 15** (image alpine). Une instance partagée avec **10 bases de données isolées**, une par service. Aucune jointure cross-service n'est autorisée.

```
Instance PostgreSQL (port 5432 interne / 5433 exposé)
│
├── haccp_auth           ← Utilisateurs, refresh tokens
├── haccp_users          ← Profils utilisateurs, groupes, membres
├── haccp_controls       ← Templates CCP, tâches, résultats checklists
├── haccp_nonconformities ← Non-conformités, commentaires, photos
├── haccp_assets         ← Produits, équipements, fournisseurs, documents
├── haccp_notifications  ← Historique notifications, tokens push
├── haccp_reports        ← Rapports, workflow validation
├── haccp_dlc            ← Lots DLC, étiquettes imprimées
├── haccp_tenants        ← Tenants, sites, zones
└── haccp_audit          ← Journal d'audit immuable
```

### 5.2 ORM — Prisma 5.11.0

Chaque service possède son propre fichier `prisma/schema.prisma`. Prisma génère un client TypeScript fortement typé.

```
services/auth-service/
├── prisma/
│   ├── schema.prisma          ← Définition du schéma
│   └── migrations/            ← Migrations SQL versionées
└── src/db/                    ← Prisma client instancié
```

**Configuration Prisma (commune à tous les services) :**
```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 5.3 Schéma — auth-service (exemple complet)

```prisma
enum UserRole {
  SUPER_ADMIN
  ADMIN
  MANAGER
  QUALITY_OFFICER
  VIEWER
  OPERATOR
}

enum UserStatus {
  ACTIVE
  INACTIVE
  INVITED
}

model User {
  id            String        @id @default(cuid())
  email         String        @unique
  name          String
  passwordHash  String        @map("password_hash")
  role          UserRole      @default(OPERATOR)
  status        UserStatus    @default(ACTIVE)
  tenantId      String        @map("tenant_id")
  createdAt     DateTime      @default(now()) @map("created_at")
  updatedAt     DateTime      @updatedAt @map("updated_at")
  refreshTokens RefreshToken[]

  @@index([tenantId])
}

model RefreshToken {
  id        String   @id @default(cuid())
  userId    String   @map("user_id")
  token     String   @unique
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

### 5.4 Convention de nommage SQL

| Convention | Application |
|-----------|------------|
| `snake_case` en base | `tenant_id`, `created_at`, `password_hash` |
| `camelCase` en TypeScript | `tenantId`, `createdAt`, `passwordHash` |
| Mapping Prisma | `@map("snake_case")` fait la translation |
| Clés primaires | `cuid()` (collision-resistant IDs) |
| Multi-tenant | Chaque table a `tenantId` + index dessus |

### 5.5 Isolation des données — règle absolue

```typescript
// ❌ INTERDIT — fuite cross-tenant
async findAll() {
  return this.prisma.product.findMany();
}

// ✅ OBLIGATOIRE — tenantId toujours depuis le JWT
async findAll(tenantId: string) {
  return this.prisma.product.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
}
```

### 5.6 Audit Log — Journal immuable

Le service `audit-service` (port 3019) est **append-only** par conception légale :
- Aucun `UPDATE` ni `DELETE` SQL n'est autorisé
- Chaque action système génère un enregistrement horodaté signé
- La base `haccp_audit` est séparée des autres et ne peut être modifiée

---

## 6. Backend — Microservices NestJS

### 6.1 Framework & Stack

Tous les 10 microservices sont construits avec le même stack :

| Outil | Version | Rôle |
|-------|---------|------|
| **NestJS** | 10.3.0 | Framework Node.js (modules, DI, pipes, guards) |
| **TypeScript** | 5.4.5 | Langage (strict mode, pas de `any`) |
| **Prisma** | 5.11.0 | ORM & migrations PostgreSQL |
| **Zod** | 3.23.0 | Validation de schéma à la frontière API |
| **Passport.js** | 0.7.0 | Middleware d'authentification |
| **@nestjs/jwt** | 10.2.0 | Génération et validation des JWT |
| **bcrypt** | 5.1.1 | Hachage des mots de passe (auth-service) |
| **prom-client** | 15.1.0 | Métriques Prometheus |
| **@nestjs/terminus** | 10.2.3 | Endpoint `/health` |
| **@nestjs/throttler** | 5.1.2 | Rate limiting au niveau service |
| **@nestjs/swagger** | 7.3.0 | Documentation OpenAPI auto-générée |

### 6.2 Pattern d'un contrôleur NestJS

```typescript
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async findAll(
    @CurrentUser() user: JwtPayload,           // ← JWT décodé par le guard
    @Query('page') page = 1,
    @Query('search') search?: string,
  ) {
    return this.productsService.findAll(user.tenantId, { page, search });
    //                          ↑ tenantId TOUJOURS depuis le JWT
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateProductDto,             // ← Validé par Zod
  ) {
    return this.productsService.create(user.tenantId, dto);
  }
}
```

### 6.3 Format de réponse standardisé

Tous les services retournent **exactement** ce format — jamais d'objet Prisma brut :

```typescript
// Réponse simple
{ data: T, message?: string }

// Réponse paginée
{
  data: T[],
  meta: {
    total: number,
    page: number,
    limit: number,
    lastPage: number
  }
}

// Erreur
{
  statusCode: number,
  error: string,
  message: string,
  timestamp: string,
  path: string
}
```

### 6.4 Endpoint de santé (obligatoire sur chaque service)

```
GET /health
→ 200 OK
{
  "status": "ok",
  "uptime": 3600,
  "version": "1.0.0"
}
```

### 6.5 Validation des variables d'environnement

Chaque service valide ses variables d'environnement au **démarrage** via Zod. Si une variable manque, l'application **crashe avec un message clair** :

```typescript
// services/auth-service/src/config/env.ts
const envSchema = z.object({
  PORT:               z.coerce.number().default(3010),
  DATABASE_URL:       z.string().url(),
  JWT_SECRET:         z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  REDIS_URL:          z.string().url(),
});

export const env = envSchema.parse(process.env);
// ↑ Lance une ZodError détaillée si une variable est manquante/invalide
```

---

## 7. Frontend Web — React / Vite

### 7.1 Stack technique

| Outil | Version | Rôle |
|-------|---------|------|
| **React** | 18.2.0 | Framework UI |
| **Vite** | 5.2.2 | Build tool & dev server (HMR) |
| **TypeScript** | 5.4.5 | Langage |
| **React Router** | 6.22.3 | Routing SPA |
| **TanStack Query** | 5.28.0 | Fetching, cache, synchronisation serveur |
| **Zustand** | 4.5.2 | État global client (auth, UI) |
| **React Hook Form** | 7.51.0 | Formulaires performants |
| **Zod** | 3.23.0 | Validation des formulaires côté client |
| **Axios** | 1.6.8 | Client HTTP |
| **Socket.io-client** | 4.7.5 | WebSocket temps réel |
| **Tailwind CSS** | 3.4.1 | Styling utilitaire |
| **Recharts** | 2.12.5 | Graphiques & KPIs |
| **i18next** | 23.11.2 | Internationalisation (FR/EN/AR) |
| **XLSX** | 0.18.5 | Export/Import Excel |
| **lucide-react** | — | Icônes |

### 7.2 Structure du code React

```
apps/web/src/
│
├── components/
│   ├── layout/          ← AppLayout, Sidebar, Header, ErrorBoundary
│   ├── ui/              ← Button, Modal, Input, Select, Badge, Toast, Combobox...
│   ├── notifications/   ← NotificationBell (temps réel)
│   └── shared/          ← ServicesHealth, composants partagés
│
├── features/            ← Un dossier par domaine métier
│   ├── auth/            ← LoginPage
│   ├── dashboard/       ← DashboardPage, KPIs
│   ├── controls/        ← ControlsPage, ChecklistExecutionModal, PlanTaskForm
│   ├── nonconformities/ ← NonconformitiesPage
│   ├── products/        ← ProductsPage
│   ├── equipments/      ← EquipmentsPage
│   ├── suppliers/       ← SuppliersPage
│   ├── documents/       ← DocumentsPage (GED)
│   ├── reports/         ← ReportsPage
│   ├── dlc/             ← DLCWebPage
│   ├── users/           ← UsersPage
│   ├── groups/          ← GroupsPage
│   ├── zones/           ← ZonesPage
│   ├── clients/         ← ClientsPage (SUPER_ADMIN)
│   ├── audit/           ← AuditPage
│   └── settings/        ← SettingsPage
│
├── hooks/               ← useDebounce, hooks personnalisés
├── lib/
│   ├── api.ts           ← Client Axios configuré
│   ├── csv.ts           ← Import/Export CSV & Excel
│   └── utils.ts         ← cn(), helpers
├── store/
│   └── auth.store.ts    ← Zustand store avec persistance
└── i18n/                ← Fichiers de traduction FR/EN/AR
```

### 7.3 Palette de couleurs & Design System

| Token | Valeur | Usage |
|-------|--------|-------|
| `brand.dark` | `#0A0F3F` | Fond sidebar, titres |
| `brand.medium` | `#5AA4C8` | CTAs, états actifs, bordures focus |
| `brand.light` | `#D0E0F0` | Badges, info boxes, hover |
| `brand.lighter` | `#EAF4FB` | Hover subtil |
| `surface.page` | `#F0F0F0` | Fond de page |
| `surface.card` | `#FFFFFF` | Fond des cartes |
| `surface.muted` | `#D8DCE8` | Bordures, séparateurs |
| `gold.DEFAULT` | `#B5833A` | Accents, avertissements |
| `gold.light` | `#F0DC90` | Fond badges warning |

---

## 8. Application Mobile — React Native / Expo

### 8.1 Stack technique

| Outil | Version | Rôle |
|-------|---------|------|
| **React Native** | 0.73.6 | Framework mobile natif |
| **Expo** | 50.0.0 | SDK & build toolchain |
| **TypeScript** | 5.4.5 | Langage |
| **React Navigation** | 6.x | Navigation (bottom-tabs, native-stack) |
| **TanStack Query** | 5.28.0 | Fetching & cache |
| **Zustand** | 4.5.2 | État global |
| **Axios** | 1.6.8 | Client HTTP |
| **Expo Camera** | 14.0.0 | Capture photo (NC, checklists) |
| **Expo Print** | 12.6.0 | Impression étiquettes DLC |
| **Expo Sharing** | 11.10.0 | Partage de fichiers |
| **Expo Secure Store** | 13.0.0 | Stockage sécurisé des tokens |
| **React Native Safe Area Context** | 4.8.2 | Gestion des zones sûres iOS/Android |

### 8.2 Fonctionnalités mobiles

L'application mobile est destinée aux **opérateurs terrain** (rôle `OPERATOR`). Elle expose :

| Fonctionnalité | Description |
|---------------|-------------|
| **Agenda de contrôles** | Liste des tâches du jour assignées à l'opérateur |
| **Exécution checklist** | Saisie des valeurs, températures, photos, signature |
| **Déclaration NC** | Formulaire de non-conformité avec photo caméra |
| **Calcul & impression DLC** | Calcul automatique + impression étiquette Bluetooth |
| **Notifications push** | Alertes temps réel via FCM (Firebase Cloud Messaging) |

---

## 9. Communication Frontend ↔ Backend

### 9.1 Client HTTP — Axios

Le fichier `apps/web/src/lib/api.ts` configure une instance Axios partagée :

```typescript
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',  // Relatif en production
  timeout: 15_000,                               // 15 secondes
  headers: { 'Content-Type': 'application/json' },
});

// ── Intercepteur de requête ──────────────────────────────────
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Pour multipart/form-data : laisser le navigateur calculer le Content-Type
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// ── Intercepteur de réponse (refresh automatique) ─────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      try {
        await useAuthStore.getState().refreshTokens();  // POST /api/v1/auth/refresh
        return api(error.config);                        // Rejoue la requête
      } catch {
        useAuthStore.getState().logout();                // Déconnexion propre
      }
    }
    return Promise.reject(error);
  },
);
```

### 9.2 Gestion du cache — TanStack Query

TanStack Query (React Query v5) gère le cache des données serveur :

```typescript
// Pattern standard dans chaque page
const { data, isLoading } = useQuery({
  queryKey: ['products', page, search, categoryFilter],
  queryFn: async () => {
    const { data } = await api.get<ApiResponse<Product[]>>(
      `/api/v1/products?page=${page}&search=${search}`
    );
    return data;
  },
  staleTime: 30_000,   // Données fraîches pendant 30s
});

// Invalidation après mutation
const mutation = useMutation({
  mutationFn: (body) => api.post('/api/v1/products', body),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
});
```

### 9.3 Authentification — Flux JWT

```
1. POST /api/v1/auth/login  { email, password }
   ← { accessToken, refreshToken, user: JwtPayload }

2. Stockage dans Zustand (persisté en localStorage sous "haccp-auth")

3. Chaque requête → Authorization: Bearer <accessToken>

4. Expiration (401) → POST /api/v1/auth/refresh { refreshToken }
   ← { accessToken, refreshToken }  (rotation automatique)

5. Échec refresh → logout() → redirection /login
```

**Structure du JWT (payload) :**
```json
{
  "sub": "cldxxx...",
  "email": "chef@restaurant.fr",
  "name": "Jean Dupont",
  "tenantId": "cldyyy...",
  "role": "ADMIN",
  "iat": 1716000000,
  "exp": 1716003600
}
```

### 9.4 Gestion des rôles côté frontend

```typescript
// store/auth.store.ts
hasRole: (role: UserRole) => user?.role === role,
isSuperAdmin: () => user?.role === 'SUPER_ADMIN',

// Utilisation dans les composants
const { user } = useAuthStore();
if (!hasRole('ADMIN') && !hasRole('MANAGER')) return <Unauthorized />;

// Routing protégé
<Route path="/clients" element={
  <RequireRole roles={['ADMIN', 'SUPER_ADMIN']}>
    <ClientsPage />
  </RequireRole>
} />
```

### 9.5 Import/Export de données

```
Export CSV/Excel :
  Frontend → collecte les données en mémoire
           → génère un fichier .csv via exportCSV()
           → déclenche le téléchargement navigateur

Import CSV/Excel :
  Utilisateur sélectionne un fichier .csv / .xlsx / .xls
  → importFile() auto-détecte le format
  → CSV : détection du séparateur (; ou ,)
  → Excel : XLSX.read() + sheet_to_json()
  → Normalisation des noms de colonnes (minuscules, sans accents)
  → POST /api/v1/{resource} pour chaque ligne (avec comptage ok/fail)
```

---

## 10. Communication Web App ↔ App Mobile

Les deux applications (web et mobile) **ne communiquent pas directement entre elles**. Elles partagent :

### 10.1 API commune via le Gateway

```
Web App  ──────┐
               ▼
          Nginx :80 ── Microservices
               ▲
Mobile App ────┘
```

Les deux clients appellent **exactement les mêmes endpoints REST** sur le même API Gateway. La différence est dans les données retournées (filtrées par rôle dans le JWT).

### 10.2 Packages TypeScript partagés

```
packages/shared-types/        ← Types identiques utilisés par web ET mobile
  └── src/
      ├── user.types.ts       ← UserRole, JwtPayload, TokenPair
      ├── control.types.ts    ← ControlTask, ChecklistItem, TaskResult
      ├── api.types.ts        ← ApiResponse<T>, PaginationMeta, ApiError
      └── ...

packages/shared-validators/   ← Même schéma Zod de validation des formulaires
```

### 10.3 Notifications push — FCM

La synchronisation **temps réel** entre web et mobile passe par le `notification-service` :

```
Événement métier (ex: NC créée par un opérateur mobile)
    ↓
nonconformity-service publie → RabbitMQ (nonconformity.nc.created)
    ↓
notification-service consomme l'événement
    ↓
    ├── Emit WebSocket → managers connectés sur le Web
    └── Push FCM      → superviseurs sur Mobile
```

### 10.4 Tokens FCM (Mobile)

```
Mobile → POST /api/v1/notifications/register-token
       { fcmToken: "...", platform: "android"|"ios" }

notification-service stocke le token en base
→ Lors d'un événement, envoie le push via FCM (Firebase Cloud Messaging)
```

### 10.5 État partagé — même source de vérité

Ni la web app ni la mobile app ne maintiennent leur propre état métier. Tout est **fetché depuis l'API** à la demande avec React Query (invalidation après chaque mutation). Les deux apps voient toujours l'état réel de la base de données.

---

## 11. Communication inter-services (RabbitMQ)

### 11.1 Protocole

**RabbitMQ 3.12** est le bus d'événements asynchrones. Le protocole **AMQP** est utilisé sur le port 5672.

### 11.2 Convention de nommage des événements

```
<domaine>.<entité>.<passé>

Exemples :
  control.task.completed         → tâche HACCP complétée
  nonconformity.nc.created       → nouvelle non-conformité
  nonconformity.nc.closed        → NC clôturée
  report.report.validated        → rapport validé
  user.user.invited              → invitation envoyée
```

### 11.3 Flux d'événements principaux

```
control-service
  └─ control.task.completed ──→ audit-service (log immuable)
                            ──→ notification-service (alerte superviseur)

nonconformity-service
  └─ nonconformity.nc.created → audit-service
                              → notification-service (email + push + WS)

report-service
  └─ report.report.validated  → notification-service (email PDF)
                              → audit-service

user-service
  └─ user.user.invited        → notification-service (email d'invitation)
```

### 11.4 Connexion URL

```
RABBITMQ_URL=amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@rabbitmq:5672
```

---

## 12. Temps réel — WebSocket (Socket.io)

### 12.1 Architecture

Le `notification-service` (port 3015) héberge le serveur **Socket.io** avec l'adaptateur Redis.

```
ARCH-DECISION : Redis comme adaptateur Socket.io
  notification-service est stateless (peut tourner en plusieurs replicas).
  Chaque replica s'abonne au même canal Redis.
  Tous les clients connectés à n'importe quel replica reçoivent l'événement.
  → Pas de coordination manuelle entre replicas.
```

### 12.2 Connexion côté client Web

```typescript
// apps/web/src/components/notifications/
const socket = io('/', {
  path: '/socket.io',
  auth: { token: accessToken },  // JWT dans le handshake
});

socket.on('notification', (payload) => {
  showToast({ title: payload.title, body: payload.body });
  queryClient.invalidateQueries({ queryKey: ['notifications'] });
});
```

### 12.3 Événements temps réel émis

| Événement | Déclencheur | Destinataires |
|-----------|-------------|---------------|
| `notification` | NC créée, tâche en retard | Managers du tenant |
| `task.updated` | Tâche complétée | Dashboard web |
| `nc.created` | Non-conformité déclarée | Superviseurs |
| `report.ready` | PDF généré | Demandeur |

---

## 13. Stockage de fichiers — MinIO

### 13.1 Présentation

**MinIO** est un serveur de stockage objet **compatible Amazon S3**. Il stocke tous les fichiers binaires :

| Bucket | Contenu | Service concerné |
|--------|---------|-----------------|
| `haccp-control-photos` | Photos de contrôles HACCP | control-service |
| `haccp-nc-photos` | Photos de non-conformités | nonconformity-service |
| `haccp-documents` | Documents GED (fiches recette, procédures) | asset-service |
| `haccp-reports` | PDFs générés et validés | report-service |

### 13.2 Upload — Flux

```
Frontend (multipart/form-data)
    ↓  POST /api/v1/nonconformities  (FormData avec photo)
API Gateway (max 20MB)
    ↓
nonconformity-service (Multer)
    ├── Valide le fichier (type MIME, taille)
    ├── Upload vers MinIO via SDK minio 8.0.1
    └── Stocke l'URL publique en base de données

URL publique : http://178.105.126.165:9000/haccp-nc-photos/{objectKey}
```

### 13.3 SDK MinIO utilisé

```typescript
import { Client as MinioClient } from 'minio';

const client = new MinioClient({
  endPoint:  env.MINIO_ENDPOINT,   // 'minio' (nom Docker)
  port:      9000,
  useSSL:    false,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

await client.putObject(bucketName, objectKey, buffer, metadata);
```

---

## 14. Authentification & Autorisation (RBAC)

### 14.1 Rôles utilisateur

| Rôle | Description | Accès principal |
|------|-------------|-----------------|
| `SUPER_ADMIN` | Administrateur plateforme | Gestion des tenants, accès total |
| `ADMIN` | Administrateur tenant | Configuration complète du tenant |
| `MANAGER` | Responsable site | Planification, validation, rapports |
| `QUALITY_OFFICER` | Responsable qualité | Lecture + rédaction NC/rapports |
| `OPERATOR` | Opérateur terrain | Mobile uniquement — exécution checklists, DLC |
| `VIEWER` | Lecteur | Lecture seule sur tous les modules |

### 14.2 Matrice RBAC (résumé)

| Module | SUPER_ADMIN | ADMIN | MANAGER | QUALITY_OFFICER | VIEWER | OPERATOR |
|--------|:-----------:|:-----:|:-------:|:---------------:|:------:|:--------:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Contrôles : voir | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Contrôles : exécuter (mobile) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Non-conformités : créer | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (mobile) |
| Produits/Équipements | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Rapports : générer | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| DLC impression (mobile) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Clients (tenants) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Utilisateurs | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### 14.3 Guards NestJS

```typescript
// Appliqué sur chaque endpoint protégé
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)

// JwtAuthGuard : valide la signature du JWT avec JWT_SECRET
// RolesGuard   : vérifie que user.role est dans @Roles(...)
// CurrentUser  : injecte le JwtPayload décodé dans les paramètres
```

### 14.4 Durée de vie des tokens

| Token | Durée | Stockage |
|-------|-------|---------|
| Access Token (JWT) | 1 heure | Mémoire Zustand (localStorage) |
| Refresh Token (opaque) | 7 jours | Base de données auth-service + localStorage |

---

## 15. Monitoring & Observabilité

### 15.1 Métriques — Prometheus + Grafana

Chaque microservice expose des métriques HTTP sur `/metrics` via `prom-client` :

```
Métriques collectées :
  - http_requests_total (par route, méthode, status)
  - http_request_duration_seconds (latence p50/p95/p99)
  - nodejs_heap_used_bytes (mémoire)
  - nodejs_active_handles_total
  - process_cpu_seconds_total
```

**Prometheus** (port 9090) scrape toutes les 15 secondes.  
**Grafana** (port 3030) affiche les dashboards avec alerting configuré.

### 15.2 Healthchecks Docker

```yaml
healthcheck:
  test: ["CMD", "wget", "--quiet", "--tries=1", "--spider",
         "http://localhost:3012/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

### 15.3 Logs

Tous les services NestJS utilisent le logger intégré NestJS (stdout) capturé par Docker. En production, ils peuvent être redirigés vers un agrégateur (ELK, Loki).

---

## 16. Sécurité

### 16.1 Couches de sécurité

| Couche | Mécanisme |
|--------|-----------|
| **Transport** | HTTPS en production (TLS terminé au niveau load balancer) |
| **Authentification** | JWT signé avec `JWT_SECRET` (min 32 chars) |
| **Autorisation** | RBAC appliqué via Guards NestJS sur chaque endpoint |
| **Isolation tenant** | `tenantId` extrait du JWT, jamais du body client |
| **Validation entrée** | Zod à la frontière API — aucun input non validé n'entre |
| **Mots de passe** | bcrypt (cost factor 10+) |
| **Rate limiting** | Nginx (100 req/s/IP) + @nestjs/throttler |
| **Secrets** | Variables d'environnement validées par Zod au démarrage |
| **Audit** | Journal immuable de toutes les actions (obligation réglementaire) |

### 16.2 Variables sensibles

Aucun secret n'est hardcodé dans le code. Tous viennent du fichier `.env` (non versionné) :

```
JWT_SECRET              (min 32 caractères)
JWT_REFRESH_SECRET      (min 32 caractères)
POSTGRES_PASSWORD
REDIS_PASSWORD
RABBITMQ_PASSWORD
MINIO_ROOT_PASSWORD
INTERNAL_SERVICE_SECRET (appels service-à-service)
```

### 16.3 Communication interne sécurisée

Les appels directs entre services (ex: user-service → auth-service pour valider un token) utilisent le header `X-Internal-Secret: ${INTERNAL_SERVICE_SECRET}` pour s'authentifier mutuellement, sans passer par le JWT utilisateur.

---

## 17. Déploiement & CI/CD

### 17.1 Script de déploiement production

```bash
bash /opt/haccp/scripts/deploy.sh           # Auto-détecte les services modifiés
bash /opt/haccp/scripts/deploy.sh web       # Force uniquement le service web
bash /opt/haccp/scripts/deploy.sh web auth-service
```

**Règles absolues du script de déploiement :**
- ✅ Seuls les services dont le code a changé sont reconstruits et redémarrés
- ✅ PostgreSQL, Redis, RabbitMQ, MinIO ne sont **jamais** touchés
- ✅ Zéro `docker compose down`, zéro `-v`, zéro `--force-recreate`
- ✅ Le seed de référence est toujours rejoué (idempotent)

**Algorithme de détection :**
```bash
git diff HEAD~1 --name-only | grep "^apps/web/"     → redémarre web
                            | grep "^services/auth"  → redémarre auth-service
                            | grep "^packages/"       → redémarre TOUS les services
```

### 17.2 Script de seed (données de référence)

```bash
bash /opt/haccp/scripts/run_seed.sh
```

Le seed est **idempotent** (ON CONFLICT DO NOTHING / DO UPDATE) et couvre :

1. Tenant principal (`haccp-main`)
2. Sites & zones de référence
3. Utilisateurs dans `haccp_auth` (avec hash bcrypt)
4. Profils dans `haccp_users` (sans password — séparation des responsabilités)
5. Templates de contrôle HACCP de référence

### 17.3 Gestion des migrations

```bash
# Dans chaque service
pnpm --filter services/auth-service db:migrate   # Applique les migrations en attente
pnpm --filter services/auth-service db:generate  # Régénère le client Prisma
```

### 17.4 Turborepo — Pipeline de build

```json
{
  "pipeline": {
    "build":     { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint":      {},
    "test":      { "dependsOn": ["^build"] }
  }
}
```

---

## 18. Récapitulatif des outils & versions

### Frontend Web

| Outil | Version | Catégorie |
|-------|---------|-----------|
| React | 18.2.0 | Framework UI |
| Vite | 5.2.2 | Build tool |
| TypeScript | 5.4.5 | Langage |
| React Router | 6.22.3 | Routing |
| TanStack Query | 5.28.0 | Server state |
| Zustand | 4.5.2 | Client state |
| React Hook Form | 7.51.0 | Formulaires |
| Zod | 3.23.0 | Validation |
| Axios | 1.6.8 | HTTP client |
| Socket.io-client | 4.7.5 | WebSocket |
| Tailwind CSS | 3.4.1 | Styling |
| Recharts | 2.12.5 | Graphiques |
| i18next | 23.11.2 | i18n FR/EN/AR |
| XLSX | 0.18.5 | Import/Export Excel |
| lucide-react | latest | Icônes |
| Playwright | 1.43.0 | Tests E2E |

### Application Mobile

| Outil | Version | Catégorie |
|-------|---------|-----------|
| React Native | 0.73.6 | Framework mobile |
| Expo | 50.0.0 | SDK & toolchain |
| React Navigation | 6.x | Navigation |
| TanStack Query | 5.28.0 | Server state |
| Zustand | 4.5.2 | Client state |
| Axios | 1.6.8 | HTTP client |
| Expo Camera | 14.0.0 | Capture photo |
| Expo Print | 12.6.0 | Impression |
| Expo Secure Store | 13.0.0 | Stockage tokens |
| Expo Sharing | 11.10.0 | Partage fichiers |
| Detox | — | Tests E2E mobile |

### Backend — Tous les services

| Outil | Version | Catégorie |
|-------|---------|-----------|
| NestJS | 10.3.0 | Framework API |
| Node.js | ≥ 20.0.0 | Runtime |
| TypeScript | 5.4.5 | Langage |
| Prisma | 5.11.0 | ORM |
| Zod | 3.23.0 | Validation |
| Passport.js | 0.7.0 | Auth middleware |
| @nestjs/jwt | 10.2.0 | JWT |
| bcrypt | 5.1.1 | Hachage mdp |
| prom-client | 15.1.0 | Métriques |
| @nestjs/terminus | 10.2.3 | Health checks |
| @nestjs/throttler | 5.1.2 | Rate limiting |
| @nestjs/swagger | 7.3.0 | OpenAPI docs |
| minio | 8.0.1 | SDK stockage S3 |
| Jest | 29.7.0 | Tests unitaires |
| testcontainers | 10.7.2 | Tests intégration |

### Infrastructure

| Outil | Version | Rôle |
|-------|---------|------|
| Docker | — | Conteneurisation |
| Docker Compose | 3.9 | Orchestration locale |
| Nginx | alpine | API Gateway, reverse proxy |
| PostgreSQL | 15-alpine | Base de données relationnelle |
| Redis | 7-alpine | Cache + Socket.io adapter |
| RabbitMQ | 3.12-management | Bus d'événements asynchrones |
| MinIO | latest | Stockage objet S3-compatible |
| Prometheus | latest | Collecte métriques |
| Grafana | 10.4.0 | Dashboards & alerting |
| Firebase (FCM) | — | Push notifications mobile |

### Monorepo & Tooling

| Outil | Version | Rôle |
|-------|---------|------|
| pnpm | 9.0.0 | Gestionnaire de paquets |
| Turborepo | 2.0.0 | Build orchestration |
| TypeScript | 5.4.5 | Compilateur |
| ESLint | 8.57.0 | Linting |
| Prettier | 3.2.5 | Formatage |

---

*Document généré le 13 Mai 2026 — NORMES HACCP v1.0*
