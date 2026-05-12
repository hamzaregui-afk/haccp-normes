# NORMES HACCP — SaaS Platform

Plateforme SaaS multi-tenant de gestion de la conformité HACCP pour l'industrie alimentaire.

## Stack technique

| Couche | Technologie |
|---|---|
| **Web** | React 18 + Vite + TypeScript + Tailwind CSS |
| **Mobile** | React Native (Expo) |
| **Backend** | 10 microservices NestJS + Prisma ORM |
| **DB** | PostgreSQL (1 DB par service) |
| **Cache / WS** | Redis + Socket.io |
| **Queue** | RabbitMQ |
| **Stockage fichiers** | MinIO (S3-compatible) |
| **Gateway** | Nginx (reverse proxy) |
| **Monitoring** | Prometheus + Grafana |

---

## Démarrage rapide (développement local)

```bash
# 1. Cloner le projet
git clone https://github.com/VOTRE_USER/haccp-normes.git
cd haccp-normes

# 2. Copier les variables d'environnement
cp .env.example .env
# Éditer .env avec vos valeurs

# 3. Démarrer la stack Docker
make docker-up

# 4. Appliquer les migrations
make migrate

# 5. Injecter les données de démo
make seed
```

L'application web sera disponible sur **http://localhost:3001**.
L'API gateway sur **http://localhost:80**.

---

## Déploiement AWS EC2 (production)

### Prérequis
- Instance EC2 Ubuntu 22.04 (t3.large recommandé : 2 vCPU, 8 GB RAM)
- Ports ouverts : 22 (SSH), 80 (HTTP), 443 (HTTPS si SSL)
- Elastic IP attachée

### Étape 1 — Bootstrap de l'instance EC2

```bash
# Se connecter à l'instance
ssh ubuntu@<EC2_IP>

# Exécuter le script de bootstrap
curl -fsSL https://raw.githubusercontent.com/VOTRE_USER/haccp-normes/main/deploy/ec2-setup.sh | sudo bash
```

Ce script installe Docker, Docker Compose, Node 20, pnpm, clone le projet dans `/opt/haccp` et configure un service systemd.

### Étape 2 — Configurer le fichier `.env`

```bash
# Depuis votre machine locale :
scp .env ubuntu@<EC2_IP>:/opt/haccp/.env
```

### Étape 3 — Configurer les secrets GitHub Actions

Dans votre dépôt GitHub → **Settings → Secrets and variables → Actions**, ajoutez :

| Secret | Description |
|---|---|
| `EC2_HOST` | IP publique de votre EC2 (ex: `54.123.45.67`) |
| `EC2_SSH_KEY` | Contenu de votre clé privée SSH PEM |
| `VITE_API_URL` | URL de l'API (ex: `https://api.normeshaccp.com`) |
| `VITE_WS_URL` | URL WebSocket (souvent identique à VITE_API_URL) |

> **Note :** `GITHUB_TOKEN` est automatiquement fourni par GitHub — pas besoin de le configurer.

### Étape 4 — Premier déploiement

```bash
# Sur l'instance EC2 :
sudo systemctl start haccp

# Vérifier les logs
docker compose -f /opt/haccp/docker-compose.yml logs -f
```

### Déploiements suivants

Tout push sur la branche `main` déclenche automatiquement :
1. Build et push des images Docker vers GHCR
2. Pull des nouvelles images sur EC2 via SSH
3. Redémarrage des conteneurs avec `docker compose up -d`
4. Application des migrations Prisma

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  SIDEBAR (280px)        │  MAIN CONTENT      │
│  NORMES HACCP           │  Header (titre)    │
│  ─────────────          │  ─────────────     │
│  OPÉRATIONS             │  Contenu page      │
│    Vue d'ensemble       │                    │
│    Contrôle             │  🔔 Notifications  │
│    Non-conformité       │  🌐 FR / EN / AR   │
│  GESTION ACTIFS         │                    │
│    Produits             │                    │
│    Équipements          │                    │
│    Fournisseurs         │                    │
│    Sites & Zones        │                    │
│    Documents (GED)      │                    │
│  ÉQUIPE                 │                    │
│    Utilisateurs         │                    │
│    Groupes              │                    │
│  ADMINISTRATION         │                    │
│    Rapports             │                    │
│    Journal d'audit      │                    │
│    Paramètres           │                    │
└─────────────────────────────────────────────┘
```

### Ports des microservices

| Service | Port |
|---|---|
| api-gateway (nginx) | 80 |
| auth-service | 3010 |
| user-service | 3011 |
| control-service | 3012 |
| nonconformity-service | 3013 |
| asset-service | 3014 |
| notification-service | 3015 |
| report-service | 3016 |
| dlc-service | 3017 |
| tenant-service | 3018 |
| audit-service | 3019 |
| web (dev) | 3001 |
| Grafana | 3030 |
| Prometheus | 9090 |
| RabbitMQ UI | 15672 |
| MinIO Console | 9001 |

---

## Commandes utiles

```bash
make help           # Afficher toutes les commandes disponibles
make docker-up      # Démarrer la stack
make docker-down    # Arrêter la stack
make docker-reset   # Réinitialiser complètement (wipe volumes)
make migrate        # Appliquer les migrations Prisma
make seed           # Injecter les données de démo
make test           # Lancer les tests unitaires
make typecheck      # Vérifier les types TypeScript
make lint           # Linter le code
```

---

## Rôles et accès

| Rôle | Accès |
|---|---|
| `SUPER_ADMIN` | Tout, y compris la gestion des tenants |
| `ADMIN` | Tout dans son tenant |
| `MANAGER` | Opérations, actifs, équipes |
| `QUALITY_OFFICER` | Lecture complète, contrôles |
| `VIEWER` | Lecture seule |
| `OPERATOR` | App mobile : agenda, NC, DLC |

---

## Phases de développement

| Phase | Périmètre | Statut |
|---|---|---|
| **0** | Monorepo, CI, shared-types, Docker | ✅ |
| **1** | Auth, users, tenants, login, sidebar | ✅ |
| **2** | Asset-service, produits, équipements, fournisseurs, groupes | ✅ |
| **3** | Control-service, contrôles, checklist, agenda mobile | ✅ |
| **4** | Nonconformity-service, NC web + mobile, WebSocket | ✅ |
| **5** | Report-service, DLC-service, rapports, DLC mobile | ✅ |
| **6** | Dashboard, GED, zones, audit, monitoring, i18n FR/EN/AR | ✅ |
