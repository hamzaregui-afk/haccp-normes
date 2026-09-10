# NORMES HACCP — Agent d'impression local

Petit service à installer sur le **PC du client** (Windows ou Linux) pour imprimer
sur une imprimante **USB / locale** depuis la plateforme SaaS NORMES HACCP.

Le serveur ne se connecte **jamais** à l'imprimante : l'agent fait des appels
**sortants** (HTTPS) vers la plateforme, récupère les tâches d'impression en
attente, imprime localement, puis renvoie le statut. Il envoie aussi un
« heartbeat » pour que l'imprimante apparaisse **« En ligne »** dans l'app web.

## Pré-requis
- **Node.js 18+** (ou utiliser le binaire `.exe` fourni — voir « Binaire »).
- L'imprimante installée dans l'OS (pilote Windows / CUPS Linux).
- Un utilisateur **OPERATEUR** dédié dans NORMES HACCP.
- L'imprimante déjà **créée dans l'app** : *Paramètres → Impression → Imprimantes*,
  mode **« Agent local (USB) »** → notez son **ID**.

## Installation (Node)
```bash
# 1. Récupérer l'agent (dossier apps/print-agent) puis :
npm install
npm run build

# 2. Configurer
cp .env.example .env
#   Éditer .env :
#     HACCP_API_URL=https://app.normes-haccp.com
#     HACCP_EMAIL / HACCP_PASSWORD  = l'opérateur dédié
#     HACCP_PRINTER_ID              = l'ID de l'imprimante créée dans l'app (mode headless)

# 3. Lancer
npm start
```

Si `HACCP_PRINTER_ID` est renseigné, l'agent démarre **sans interaction**
(idéal pour un service). Sinon, il propose de choisir une imprimante au 1er lancement.

## Binaire Windows (sans Node)
```bash
npm run pkg:win     # produit haccp-print-agent.exe (node18-win-x64)
```
Copier le `.exe` + le `.env` dans un dossier sur le PC client, puis lancer le `.exe`.

## Démarrage automatique (service)
- **Windows** — via [NSSM](https://nssm.cc/) :
  ```
  nssm install HaccpPrintAgent "C:\haccp\haccp-print-agent.exe"
  nssm set HaccpPrintAgent AppDirectory "C:\haccp"
  nssm start HaccpPrintAgent
  ```
- **Linux** — unité systemd pointant sur `node dist/agent.js` avec `WorkingDirectory`
  = le dossier contenant `.env`.

## Vérification
Dans l'app web, *Paramètres → Impression → Imprimantes* : l'imprimante servie par
l'agent passe à **« En ligne »** dès que l'agent tourne. Le bouton ▶ **Tester
l'impression** doit faire sortir une étiquette.

## Sécurité
- `HACCP_API_URL` doit être le **domaine HTTPS** (`app.normes-haccp.com`), jamais une IP.
- Utiliser un compte **opérateur dédié** (moindre privilège), pas un compte admin.
- Le `.env` contient un mot de passe : restreindre les droits du fichier / dossier.

## Dépannage
| Symptôme | Cause probable |
|---|---|
| `HACCP_EMAIL and HACCP_PASSWORD must be set` | `.env` absent ou incomplet |
| L'imprimante reste « hors ligne » | agent arrêté, mauvais `HACCP_PRINTER_ID`, ou pas de réseau sortant |
| Job en échec | imprimante OS injoignable / hors ligne / mauvais nom |
| 401 / login échoue | identifiants opérateur invalides, ou mauvaise `HACCP_API_URL` |
