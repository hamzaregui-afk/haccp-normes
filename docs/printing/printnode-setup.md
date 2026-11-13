# Impression DLC — Guide de configuration (PrintNode & Agent local)

> Public : administrateurs de client (ADMIN) et support NORMES HACCP.
> Ce guide explique comment connecter une imprimante locale à la solution cloud.

## Le problème que ça résout

L'application NORMES HACCP est hébergée dans le cloud (Hetzner). Les imprimantes
sont **physiquement chez le client**. Le serveur cloud **ne peut pas** parler
directement à une imprimante USB ou Bluetooth située dans les locaux du client.
Il faut donc un **relais local**. Deux méthodes sont disponibles :

| Méthode | Pour quelles imprimantes | Ce qu'il faut installer chez le client |
|---|---|---|
| **PrintNode** | Imprimante **réseau/USB** branchée à un ordinateur allumé | Le **client PrintNode** (logiciel tiers) sur cet ordinateur |
| **Agent local HACCP** | Imprimante **USB** (Windows/Linux) | L'agent `@haccp/print-agent` (voir `apps/print-agent/README.md`) |
| **Réseau direct** | Imprimante **IP** sur le même réseau que le serveur | Rien (le serveur ouvre un socket TCP) — rarement applicable en cloud |

> ⚠️ **Une clé API PrintNode seule n'imprime rien.** PrintNode fonctionne
> uniquement si un **client PrintNode est installé et en cours d'exécution** sur
> un ordinateur local qui a accès à l'imprimante. C'est une contrainte de
> PrintNode, pas de NORMES HACCP.

---

## Méthode A — PrintNode (recommandée pour la plupart des clients)

### Chaîne complète

```
NORMES HACCP (cloud) → API backend → API PrintNode (cloud)
   → Client PrintNode (ordinateur local du client) → imprimante → étiquette DLC
```

### Prérequis côté plateforme (une seule fois, par l'équipe HACCP)

Le stockage chiffré des clés API PrintNode exige la variable d'environnement
`ENCRYPTION_KEY` sur le serveur. Tant qu'elle n'est pas définie,
`Administration → Paramètres → Imprimantes` affiche un bandeau d'avertissement et
l'enregistrement d'une clé renvoie une erreur 400.

```bash
# Sur le serveur, dans /opt/haccp :
openssl rand -hex 32                                   # génère une clé ≥32 car.
# Ajouter ENCRYPTION_KEY=<valeur> dans /opt/haccp/.env, puis :
docker compose up -d --force-recreate printing-service # un restart ne suffit pas
```

> Cette clé chiffre les clés PrintNode au repos. **Ne la changez plus** une fois
> en service, sinon les clés PrintNode déjà enregistrées devront être re-saisies.

### Étapes côté client (par l'ADMIN du client)

1. **Créer un compte PrintNode** sur https://www.printnode.com et récupérer la
   **clé API** (Account → API Keys).
2. **Installer le client PrintNode** sur un ordinateur du client (Windows/Mac/Linux)
   qui restera **allumé** et qui **voit l'imprimante** (imprimante installée dans
   le système d'exploitation, USB ou réseau). Télécharger sur
   https://www.printnode.com/en/download. Se connecter avec le compte PrintNode.
3. Dans NORMES HACCP : `Administration → Paramètres → Imprimantes` →
   carte **« Connexion PrintNode »** :
   - Coller la **clé API**.
   - Cliquer **« Tester »** → doit afficher le nombre d'ordinateurs détectés.
   - Cliquer **« Enregistrer »** (la clé est chiffrée, jamais réaffichée).
4. **Ajouter une imprimante** → mode **PrintNode** :
   - **« Ordinateurs »** → choisir l'ordinateur sur lequel tourne le client PrintNode.
   - **« Imprimantes »** → choisir l'imprimante.
   - Choisir un **profil d'étiquette** (voir plus bas), **tester l'impression**,
     puis **enregistrer** et éventuellement **définir par défaut**.

### Vérifications / dépannage

| Symptôme | Cause probable |
|---|---|
| « Clé invalide » au test | Clé API erronée / compte PrintNode suspendu |
| Aucun ordinateur dans la liste | Client PrintNode non installé, non démarré, ou pas connecté au bon compte |
| Aucune imprimante dans la liste | L'imprimante n'est pas installée dans l'OS de l'ordinateur local |
| Tâche « FAILED : PrintNode non configuré » | `ENCRYPTION_KEY` absente, ou clé non enregistrée pour ce client |
| Étiquette vierge / mal dimensionnée | Mauvais **protocole** (ZPL/TSPL/ESC_POS) ou **profil d'étiquette** |

---

## Méthode B — Agent local HACCP (imprimantes USB)

Pour une imprimante USB sans passer par PrintNode, installer l'agent
`@haccp/print-agent` sur l'ordinateur local — voir **`apps/print-agent/README.md`**
(installation, compte OPÉRATEUR dédié, service NSSM/systemd, dépannage). L'agent
interroge le backend en HTTPS sortant, réclame les tâches `PENDING` de son
imprimante, imprime, puis confirme — c'est le seul chemin qui remonte un vrai
signal « imprimé physiquement » (statut `COMPLETED` + `printedAt`).

---

## Profils d'étiquettes (format DLC)

`Administration → Paramètres → Imprimantes → « Profils d'étiquettes »` permet de
créer des profils réutilisables : largeur/hauteur (mm), orientation, DPI, marges,
type de support (gap / repère noir / continu), découpe, densité, vitesse.
Associez un profil par défaut à chaque imprimante. Le rendu s'adapte au
**protocole** de l'imprimante (ZPL pour Zebra, TSPL pour TSC/GPrinter, ESC/POS).

## Statut « accepté » vs « imprimé »

- **Réseau TCP / PrintNode** : `COMPLETED` = octets transmis / tâche acceptée par
  PrintNode — **pas** une preuve d'impression physique.
- **Agent local (USB)** : la tâche reste `PENDING` jusqu'à ce que l'agent confirme
  `COMPLETED` après l'impression réelle — c'est le signal le plus fiable.

Le système ne marque **jamais** une tâche comme réussie sur la seule base de
l'acceptation HTTP (intégrité HACCP).
