# Mobile Deployment Runbook — NORMES HACCP (Expo / EAS)

État au 2026-07-15. Le **code** mobile est prêt (API pointée sur `https://app.normes-haccp.com`,
suite jest verte : 137 tests). Le déploiement store est bloqué par **deux prérequis externes**
que seul le propriétaire du compte peut réaliser (accès registrar DNS + comptes Apple/Google/Expo).
Tout le reste est automatisé/prêt.

Chaîne complète : **DNS → TLS valide → build EAS → submit stores**.

---

## Étape 1 — DNS — ✅ FAIT (2026-07-16)

Le DNS de `normes-haccp.com` est géré chez **Hostinger** (`ns1/ns2.dns-parking.com`).
L'enregistrement suivant est **en place et vérifié** :

| Type | Nom | Valeur            | TTL  |
|------|-----|-------------------|------|
| A    | app | `178.105.126.165` | 3600 |

> Le sous-domaine retenu est **`app`** (et non `api`) : c'est celui qui a été créé et qui
> résout correctement. L'apex `normes-haccp.com` (site officiel, hébergé chez Hostinger) et
> les enregistrements `www`/`MX` sont **intacts** — seule la ligne `app` a été ajoutée.

Vérification :
```bash
nslookup -type=A app.normes-haccp.com 8.8.8.8   # -> 178.105.126.165  ✅
```
> Reliquat sans impact : `api.normes-haccp.com` pointe encore vers l'hébergement Hostinger
> (ancien sous-domaine créé par erreur). Inutilisé — peut être supprimé pour faire propre.

## Étape 2 — TLS valide (automatisé — je le déclenche une fois le DNS propagé)

Le gateway sert aujourd'hui un cert **auto-signé** (`CN=178.105.126.165`) que les téléphones
rejettent — c'est LE bloquant store (INFRA-1). Une action de déploiement garde-fou provisionne
un vrai certificat **Let's Encrypt** :

- Workflow : **Deploy → Run workflow → action `setup-tls`** (`.github/workflows/deploy.yml`).
- L'action **refuse de s'exécuter** tant que `app.normes-haccp.com` ne résout pas vers ce serveur
  (garde-fou : le cert auto-signé actuel reste intact en cas d'abandon).
- Elle : installe certbot → libère le port 80 (~30 s d'arrêt gateway) → émet le cert HTTP-01 →
  copie `fullchain/privkey` dans `/opt/haccp/ssl/{cert,key}.pem` (chemin monté par nginx) →
  recrée le gateway → installe un hook de **renouvellement auto** → vérifie
  `https://app.normes-haccp.com/api/v1/health`.

Vérification manuelle post-exécution :
```bash
curl -I https://app.normes-haccp.com/api/v1/health           # HTTP 200, pas d'erreur cert
echo | openssl s_client -connect app.normes-haccp.com:443 \
  -servername app.normes-haccp.com 2>/dev/null | openssl x509 -noout -issuer
# issuer = Let's Encrypt (plus "CN=178.105.126.165")
```
> Le routage nginx est déjà prêt : le server-block TLS catch-all
> (`infrastructure/nginx/nginx.conf`) matche déjà `app.normes-haccp.com` ; seul le cert change.

## Étape 3 — Build EAS (⚠️ nécessite un compte Expo + credentials stores)

Config prête : `apps/mobile/eas.json` (profils `preview` APK + `production`), `app.json`
(`bundleIdentifier`/`package` = `com.normeshaccp.app`), `EXPO_PUBLIC_API_BASE_URL=https://app.normes-haccp.com`.

Prérequis à fournir (comptes/secrets — non gérables par l'assistant) :
- **Expo** : `npx eas login` (compte Expo/EAS).
- **Android** : compte Google Play Console + `google-service-account.json` (clé service, à
  déposer et référencer dans `eas.json > submit`). Actuellement **absent**.
- **iOS** : Apple Developer + `ascAppId` réel dans `eas.json` (aujourd'hui **placeholder**),
  Bundle ID enregistré, certificats gérés par EAS.

Commandes :
```bash
cd apps/mobile
# Build de test interne (APK Android, se partage sans store) :
npx eas build --profile preview  --platform android
# Builds production :
npx eas build --profile production --platform android
npx eas build --profile production --platform ios
```
> ⚠️ Ne lancer un build qu'**après** l'Étape 2 (TLS valide). Un build avant DNS/TLS produit
> une app qui ne peut pas joindre l'API.

## Étape 4 — Submit stores (⚠️ credentials stores)

```bash
cd apps/mobile
npx eas submit --profile production --platform android   # → Google Play (service account)
npx eas submit --profile production --platform ios       # → App Store Connect (ascAppId)
```

---

## Récapitulatif — qui fait quoi

| # | Action | Qui | Statut |
|---|--------|-----|--------|
| 1 | Créer l'enregistrement A `app` chez Hostinger | **Propriétaire** (accès registrar) | ✅ **fait** (2026-07-16) |
| 2 | Provisionner TLS Let's Encrypt (`setup-tls`) | Assistant | 🟡 débloqué — à déclencher |
| 3 | Fournir Expo login + `ascAppId` + `google-service-account.json` | **Propriétaire** (comptes) | ⛔ à faire |
| 4 | Lancer `eas build` / `eas submit` | Propriétaire (avec credentials) | ⏸️ dépend de 2-3 |

## Rollback
- TLS : si `setup-tls` échoue, il redémarre le gateway avec le cert existant (aucune régression).
  Pour revenir au self-signed : action `setup-https`.
- Le déploiement backend (`main` → Hetzner) est indépendant du mobile ; rien ici ne le modifie.

Voir aussi `INFRA-1` / `CI-1` dans `BUGS.md`.
