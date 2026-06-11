# BUGS.md — Suivi bugs & tâches (focus app mobile → production)

> Créé en Phase 0 de la mission « app mobile niveau production ».
> Convention statut : `🔴 ouvert` · `🟡 en cours` · `🟢 corrigé` · `⏸️ en attente validation`
> Convention priorité : `P0` bloquant prod · `P1` important · `P2` confort.

---

## 🔐 Sécurité / Infra (hors-code, décision requise)

| # | P | Statut | Sujet | Détail |
|---|---|---|---|---|
| SEC-1 | P0 | 🔴 ouvert | Token GitHub en clair dans le remote git | `git remote -v` contient un `gho_…` en clair. À **révoquer** sur GitHub et reconfigurer le remote via credential helper / `GITHUB_TOKEN`, sans secret en clair. Ne jamais committer. |
| INFRA-1 | P0 | ⏸️ en attente validation | API prod = IP brute + cert auto-signé | `EXPO_PUBLIC_API_BASE_URL=https://178.105.126.165` (cert self-signed). Les devices réels (iOS/Android) **rejettent** ce certificat → app inutilisable en prod. Besoin domaine + TLS valide (ex. `api.normes-haccp.com`, Cloudflare Full). Touche l'infra → validation requise. |

---

## 📱 Mobile — Authentification

| # | P | Statut | Sujet | Détail |
|---|---|---|---|---|
| AUTH-1 | P1 | 🟢 corrigé | refreshToken jamais persisté | `LoginScreen` faisait `setAuth(accessToken, user)` et **ignorait** `res.data.refreshToken`. → corrigé : `setAuth(accessToken, user, refreshToken)`. Test renforcé. |
| AUTH-2 | P1 | 🟢 corrigé | Pas de silent refresh | Intercepteur réponse 401 ajouté dans `api/client.ts` : refresh via `POST /api/v1/auth/refresh` → rejeu de la requête, **single-flight** (mutualise un seul refresh pour les appels parallèles, évite la rotation concurrente), garde `_retry` + exclusion des routes `/auth/*`. Échec refresh → `logout()`. 3 tests verts. |
| AUTH-3 | P1 | 🟢 corrigé | logout sur mauvaise route | `authStore.logout()` utilisait `authClient` (sans token) + `/auth/logout` (sans `/api/v1`) → 404 silencieux. → corrigé : `apiClient` (Bearer) + `/api/v1/auth/logout`. |

---

## 📱 Mobile — Fonctionnalités production

| # | P | Statut | Sujet | Détail |
|---|---|---|---|---|
| PUSH-1 | P1 | ⏸️ en attente validation | Notifications push absentes | Pas d'`expo-notifications`, pas d'enregistrement device. Backend : `FCM_SERVER_KEY` optionnel **sans implémentation d'envoi** ; notification-service = WebSocket (Socket.io) et le mobile n'a pas de client socket.io. Touche backend → validation requise. |
| OFF-1 | P0 | 🔴 ouvert | Mode hors-ligne / sync inexistant | Tous les écrans exigent le réseau. Besoin file d'écriture locale (contrôles/NC) + rejeu à la reconnexion. **Confirmé indispensable** par le PO. |
| NCPHOTO-1 | P1 | 🔴 ouvert | Photos NC absentes | Permissions caméra déclarées dans `app.json` mais aucune dépendance image-picker/caméra ; le backend NC gère pourtant les photos. |
| OBS-1 | P2 | 🔴 ouvert | Pas de crash-reporting mobile | Aucun Sentry/observabilité côté app (backend = Prometheus/Grafana). |
| CI-1 | P1 | 🔴 ouvert | Pas de pipeline EAS mobile | CI couvre lint/typecheck/test du workspace mobile, mais aucun job EAS build/submit. `eas.json` : `ascAppId` placeholder, `google-service-account.json` absent. |
| CI-2 | P0 | 🟢 corrigé | `pnpm-lock.yaml` désynchronisé (SDK 50→51) | Le lockfile épinglait encore les specs SDK 50 alors que `apps/mobile/package.json` est en SDK 51 → la CI (`pnpm install --frozen-lockfile`) échouait (`ERR_PNPM_OUTDATED_LOCKFILE`). → lockfile régénéré (install SDK 51). À committer. |
| TEST-1 | P0 | 🟢 corrigé | Tests d'écrans cassés (i18n + assertions périmées) | `ProfileScreen`, `NCFormScreen`, `DLCScreen`, `ChecklistScreen` montaient les écrans **sans** `<I18nProvider>` (≈112 échecs) + assertions périmées (DLC : payload `lotNumber/fabricationDate/shelfLifeDays` → `productId/dlcDays/producedAt`, titres d'alerte, placeholders `Ex :` ; Checklist : `DONE`→`COMPLETED`, `Chargement…`, `Contrôle incomplet`) + mocks incomplets (`authStore.user`, `expo-print.printToFileAsync`, `expo-sharing.isAvailableAsync`, `useQuery` stable par `queryKey`). → wrapper `<I18nProvider>` partagé (`src/test-utils.tsx`) + assertions alignées sur le code actuel. **Suite mobile : 8 suites / 137 tests verts.** |
| TEST-2 | P1 | 🟢 corrigé | Harnais jest incompatible pnpm | `transformIgnorePatterns` écrit pour un `node_modules` hoisté → sous pnpm (`node_modules/.pnpm/…`) le polyfill RN (Flow) n'était jamais transpilé. + `babel-preset-expo` et `@babel/runtime` non hoistés (manquaient en deps directes) + mock mort `expo-camera` dans `test-setup.ts`. → pattern rendu pnpm-compatible, deps déclarées, mock retiré. La suite mobile s'exécute enfin. |

---

## 🖨️ EPIC — Moteur d'impression pro (4 niveaux)

> Objectif : LabelTemplate (métier) / MediaProfile / Printer (TSPL·ZPL·ESC-POS) / Affectations (Site·Zone·User·Module). Approche **expand/contract**, zéro régression sur le chemin DLC actuel. Décision : mobile = impression **réseau/agent** uniquement (pas de BT/USB natif). Flux : GitHub → commit → push → Hetzner (push/deploy sur « go » explicite).

| # | Phase | Statut | Détail |
|---|---|---|---|
| PRINT-A1 | A — Fondations | 🟡 en cours | **Schéma + migration faits & validés** : enums `MediaType`/`PrinterProtocol`/`PrinterConnection`/`PrinterStatus`/`AssignmentScope`, modèles `MediaProfile` + `PrinterAssignment`, colonnes additives `Printer` (brand, protocol, connection, defaultMediaProfileId, connectionStatus, lastActivityAt). `prisma validate` OK, client régénéré. Migration `20260610000000_printing_media_assignments`. |
| PRINT-A2 | A — Schémas partagés | 🟢 fait | `shared-validators/src/printing.schema.ts` (Create/Update/Query MediaProfile + PrinterAssignment + Resolve, enums) + `shared-types/src/printing.types.ts` (entités). Barrels mis à jour. Compile OK (DTO d'entrée en `.min(1)`, pas `.cuid()`). |
| PRINT-A3 | A — Modules NestJS | 🟢 fait | Modules `media-profiles` + `printer-assignments` (CRUD tenant-scoped, RBAC, audit, `isDefault` atomique, endpoint **`/printer-assignments/resolve`** ZONE>SITE>USER>MODULE + fallback défaut). `Printer` DTO/serv. étendus (brand/protocol/connection/defaultMediaProfileId, additifs). **Bonus** : harnais jest du service réparé (`@types/jest` manquant + `moduleNameMapper` faux `../../`→`../../../`). **Suite service : 48/48 verts** (11 nouveaux + 37 existants qui tournaient jamais avant). |
| PRINT-A4 | A — Gateway | 🟢 fait | Routes nginx additives `/api/v1/media-profiles` + `/api/v1/printer-assignments` ajoutées dans les **deux** serveurs (80 + 443). |
| PRINT-B | B — Moteur rendu | 🔴 à faire | TSPL/ZPL/ESC-POS + LabelTemplate agnostique ; parité DLC (snapshots golden) avant bascule. |
| PRINT-C | C — Web | 🔴 à faire | `Paramètres → Impression` : Imprimantes (étendu), Profils Média, Templates, Tests, Calibration. |
| PRINT-D | D — Mobile | 🔴 à faire | Sélection imprimante par module (réseau/agent), abstraction protocole. |
| PRINT-E | E — Agent | 🔴 à faire | Auto-start service, reconnexion, multi-imprimantes, queue, reprise + guides Win/Mac/Linux. |
| PRINT-F | F — Audit+E2E+deploy | 🔴 à faire | Impacts DLC/Traçabilité/Contrôles/Réception/GED/Notifs/Rapports ; E2E ; déploiement. |

## 🟢 Corrigés

_(voir AUTH-1/2/3, CI-2, TEST-1/2 ci-dessus)_
