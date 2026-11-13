# Impression DLC par Bluetooth natif (Android) — Lot B

> Public : équipe HACCP + testeurs terrain. Décrit la méthode B (Bluetooth
> direct), ses limites honnêtes, la construction de l'app, et la **procédure de
> validation matérielle** (obligatoire — rien n'est validé sans vrai matériel).

## Ce que le Lot B ajoute

Un second chemin d'impression dans l'écran DLC du mobile, **à côté** de l'Option A
(réseau/PrintNode via le backend) :

```
Écran DLC → « Imprimer via Bluetooth »
  → POST /api/v1/dlc/calculate      (date d'expiration)
  → POST /api/v1/print-jobs/render  (le SERVEUR rend les octets ESC/POS — pas le mobile)
  → scan BLE → l'utilisateur choisit l'imprimante
  → écriture des octets sur la caractéristique inscriptible (par chunks MTU)
```

Les octets de l'étiquette sont **toujours rendus côté serveur** (mêmes renderers
ZPL/TSPL/ESC_POS que PrintNode) — le mobile ne génère rien, donc Bluetooth et
PrintNode produisent **exactement la même étiquette**.

## ⚠️ Limites honnêtes (ne PAS surestimer)

- **BLE (GATT) uniquement.** Les imprimantes **Bluetooth Classic SPP** (beaucoup
  d'imprimantes thermiques bon marché) ne sont **pas** pilotables par ce chemin —
  elles nécessitent un transport Classic différent. Utilisez PrintNode / l'agent
  local pour celles-là.
- **iOS : bloqué** pour les imprimantes Classic-SPP **non-MFi** — contrainte Apple
  Core Bluetooth/MFi, pas un défaut de code. Le code BLE tourne sur iOS pour des
  imprimantes **BLE/GATT** uniquement.
- **Build natif requis** : l'ajout de `react-native-ble-plx` impose un **nouveau
  build EAS** (dev/preview). **Ne tourne PAS dans Expo Go.**
- **NON VALIDÉ sur matériel** par l'équipe à ce stade : la détection automatique
  de la caractéristique inscriptible et le découpage (chunking) doivent être
  vérifiés sur **chaque modèle réel**. Protocole par défaut = **ESC/POS**.

## Construire l'app (EAS)

Version bumpée : `1.0.4` / `versionCode 5` / iOS `buildNumber 5`. Depuis le
dashboard Expo (comme pour l'APK précédent) :

1. **Build from GitHub** → base `/apps/mobile`, **Android**, git ref `main-sync`,
   profil **preview** (produit un APK installable).
2. Installer l'APK sur un vrai appareil Android (le BLE ne fonctionne pas sur
   l'émulateur).

> Un build `development` (dev client) permet aussi le test avec rechargement.

## Procédure de validation matérielle (à réaliser — ne rien inventer)

Matériel nécessaire : **1 appareil Android réel** + **1 imprimante thermique BLE**
(ex. certaines Zebra ZQ/ZD BLE, ou une imprimante ESC/POS BLE). Pour chaque
imprimante testée, remplir la matrice :

| Modèle | Connexion | Android (version/API) | Résultat | Défauts observés |
|---|---|---|---|---|
| … | BLE | … | … | … |

Étapes :

1. Activer le Bluetooth sur l'appareil. Lancer l'app (build EAS), se connecter.
2. Écran **DLC** → saisir produit + lot + date de fabrication + durée.
3. Toucher **« Imprimer via Bluetooth »** → accepter les permissions Bluetooth
   (Android 12+ : Appareils à proximité).
4. Le scan liste les appareils BLE nommés → choisir l'imprimante.
5. **Observer** : l'étiquette sort-elle ? dimensions / texte / code-barres /
   lisibilité / découpe corrects ? (comparer au rendu Option A).
6. Cas d'erreur à vérifier (messages clairs attendus) :
   - Bluetooth **désactivé** → « Activez le Bluetooth… »
   - Permission **refusée** → « Permissions Bluetooth refusées… »
   - Imprimante **Classic SPP / sans caractéristique inscriptible** → message
     d'incompatibilité (comportement attendu : ce mode ne la gère pas).

Si une étiquette sort mais est mal dimensionnée : vérifier le **profil
d'étiquette** (Paramètres → Imprimantes → Profils) et le **protocole** (le mobile
envoie ESC/POS par défaut — une imprimante ZPL/TSPL BLE nécessiterait d'étendre
le flux pour choisir le protocole : amélioration future).

## Dépannage

| Symptôme | Piste |
|---|---|
| Aucun appareil au scan | BT éteint, permissions refusées, imprimante non appairée/hors tension, ou imprimante Classic-only (non visible en BLE) |
| « Imprimante incompatible » | L'appareil ne publie pas de caractéristique BLE inscriptible → Classic SPP : utiliser PrintNode/agent |
| Impression partielle / corrompue | MTU/chunking à ajuster pour ce modèle ; protocole incorrect (ESC/POS vs ZPL/TSPL) |
| Rien sur iOS | Imprimante Classic-SPP non-MFi → non supporté par iOS (utiliser PrintNode/agent) |

## Points restants / améliorations futures

- Sélection du **protocole** dans le flux Bluetooth (aujourd'hui ESC/POS en dur).
- Support **Bluetooth Classic SPP** (lib dédiée + config plugin, Android) pour les
  imprimantes qui n'exposent pas de service BLE.
- Validation matérielle réelle (matrice ci-dessus) — **à faire**.
