#!/usr/bin/env python3
"""
seed_checklists.py — Configure les checklists par défaut pour chaque modèle de contrôle HACCP.

Ce script :
  1. S'authentifie comme admin
  2. Récupère tous les modèles de contrôle existants
  3. Pour chaque modèle dont la checklist est vide, injecte les items par défaut
     correspondant au type de contrôle (RECEPTION, TEMPERATURE_STOCK, etc.)
  4. Ignore les modèles qui ont déjà des items configurés

Usage:
  python scripts/seed_checklists.py
  python scripts/seed_checklists.py --force   # Écrase même les checklists existantes
"""
import json, sys, io, time, uuid, argparse
import urllib.request, urllib.error

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

BASE_URL = "http://localhost:3001"

# ─── Checklist items par défaut par type de contrôle ──────────────────────────
# Chaque item a: id, label, type, required, et optionnellement unit/min/max/options

def mk_id():
    return str(uuid.uuid4())[:9].replace('-', '')

DEFAULT_CHECKLISTS = {
    "RECEPTION": [
        {
            "id": mk_id(),
            "label": "Température à réception",
            "type": "TEMPERATURE",
            "unit": "°C",
            "min": -2,
            "max": 4,
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "DLC / DLUO du produit",
            "type": "DATE",
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "État du conditionnement (intégrité emballage)",
            "type": "BOOLEAN",
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Conformité de l'étiquetage (origine, allergènes)",
            "type": "BOOLEAN",
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Photo du bon de livraison / étiquette",
            "type": "PHOTO",
            "required": False,
        },
        {
            "id": mk_id(),
            "label": "Fournisseur / Nom du produit",
            "type": "TEXT",
            "required": False,
        },
        {
            "id": mk_id(),
            "label": "Signature du réceptionnaire",
            "type": "SIGNATURE",
            "required": True,
        },
    ],

    "TEMPERATURE_STOCK": [
        {
            "id": mk_id(),
            "label": "Frigo 1 — Température",
            "type": "TEMPERATURE",
            "unit": "°C",
            "min": 0,
            "max": 4,
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Frigo 2 — Température",
            "type": "TEMPERATURE",
            "unit": "°C",
            "min": 0,
            "max": 4,
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Chambre froide négative (CFN) 1 — Température",
            "type": "TEMPERATURE",
            "unit": "°C",
            "min": -25,
            "max": -18,
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Congélateur 1 — Température",
            "type": "TEMPERATURE",
            "unit": "°C",
            "min": -25,
            "max": -18,
            "required": False,
        },
        {
            "id": mk_id(),
            "label": "État général du stockage (propreté, organisation)",
            "type": "BOOLEAN",
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Observations",
            "type": "TEXT",
            "required": False,
        },
    ],

    "TEMPERATURE_DISPLAY": [
        {
            "id": mk_id(),
            "label": "Vitrine froide salée — Température",
            "type": "TEMPERATURE",
            "unit": "°C",
            "min": 0,
            "max": 4,
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Vitrine froide sucrée — Température",
            "type": "TEMPERATURE",
            "unit": "°C",
            "min": 0,
            "max": 4,
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Vitrine chaude — Température",
            "type": "TEMPERATURE",
            "unit": "°C",
            "min": 63,
            "max": 85,
            "required": False,
        },
        {
            "id": mk_id(),
            "label": "Propreté et état de la vitrine",
            "type": "BOOLEAN",
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "DLC des produits exposés respectées",
            "type": "BOOLEAN",
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Observations",
            "type": "TEXT",
            "required": False,
        },
    ],

    "TEMPERATURE_OIL": [
        {
            "id": mk_id(),
            "label": "Friteuse 1 — Température de l'huile",
            "type": "TEMPERATURE",
            "unit": "°C",
            "min": 160,
            "max": 180,
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Friteuse 2 — Température de l'huile",
            "type": "TEMPERATURE",
            "unit": "°C",
            "min": 160,
            "max": 180,
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Friteuse 3 — Température de l'huile",
            "type": "TEMPERATURE",
            "unit": "°C",
            "min": 160,
            "max": 180,
            "required": False,
        },
        {
            "id": mk_id(),
            "label": "Friteuse 1 — État de l'huile",
            "type": "SELECT",
            "options": ["Bonne", "Dégradée — à changer", "Changée"],
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Friteuse 2 — État de l'huile",
            "type": "SELECT",
            "options": ["Bonne", "Dégradée — à changer", "Changée"],
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Friteuse 3 — État de l'huile",
            "type": "SELECT",
            "options": ["Bonne", "Dégradée — à changer", "Changée", "Non utilisée"],
            "required": False,
        },
        {
            "id": mk_id(),
            "label": "Photo de l'état de l'huile",
            "type": "PHOTO",
            "required": False,
        },
    ],

    "EQUIPMENT": [
        {
            "id": mk_id(),
            "label": "Équipement en bon état de fonctionnement",
            "type": "BOOLEAN",
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Nettoyage / désinfection de l'équipement effectué",
            "type": "BOOLEAN",
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Absence de corps étrangers ou contamination visible",
            "type": "BOOLEAN",
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Maintenance préventive à jour",
            "type": "BOOLEAN",
            "required": False,
        },
        {
            "id": mk_id(),
            "label": "Photo de l'équipement",
            "type": "PHOTO",
            "required": False,
        },
        {
            "id": mk_id(),
            "label": "Observations / anomalies constatées",
            "type": "TEXT",
            "required": False,
        },
    ],

    "SANITARY": [
        {
            "id": mk_id(),
            "label": "Nettoyage des surfaces de travail effectué",
            "type": "BOOLEAN",
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Nettoyage des sols effectué",
            "type": "BOOLEAN",
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Nettoyage des équipements / ustensiles effectué",
            "type": "BOOLEAN",
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Désinfection des surfaces effectuée",
            "type": "BOOLEAN",
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Produits de nettoyage correctement stockés et identifiés",
            "type": "BOOLEAN",
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Présence de nuisibles ou traces",
            "type": "SELECT",
            "options": ["Aucune trace", "Traces détectées", "Signalement effectué"],
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Photo de l'état sanitaire",
            "type": "PHOTO",
            "required": False,
        },
        {
            "id": mk_id(),
            "label": "Observations",
            "type": "TEXT",
            "required": False,
        },
    ],

    "DAILY_PRODUCTION": [
        {
            "id": mk_id(),
            "label": "Produit fabriqué",
            "type": "TEXT",
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Quantité produite",
            "type": "NUMBER",
            "unit": "kg",
            "min": 0,
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Date et heure de fabrication",
            "type": "DATE",
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "DLC / DLUO",
            "type": "DATE",
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Température de cuisson / pasteurisation atteinte",
            "type": "TEMPERATURE",
            "unit": "°C",
            "min": 63,
            "required": False,
        },
        {
            "id": mk_id(),
            "label": "Traçabilité matières premières (photo étiquette ou BL)",
            "type": "PHOTO",
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Signature du responsable de production",
            "type": "SIGNATURE",
            "required": True,
        },
        {
            "id": mk_id(),
            "label": "Observations",
            "type": "TEXT",
            "required": False,
        },
    ],
}

# ─── HTTP helpers ──────────────────────────────────────────────────────────────

def req(method, path, body=None, token=""):
    url  = f"{BASE_URL}{path}"
    data = json.dumps(body).encode() if body else None
    hdrs = {"Content-Type": "application/json"}
    if token: hdrs["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f"  ⚠  HTTP {e.code} {method} {path}: {err[:200]}")
        return {}

def get(p, t=""):    return req("GET",  p, None, t)
def post(p, b, t=""): return req("POST", p, b,    t)
def patch(p, b, t=""): return req("PATCH", p, b,  t)

# ─── Main ──────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="Seed default HACCP checklists")
parser.add_argument("--force", action="store_true",
                    help="Overwrite checklists that already have items")
args = parser.parse_args()

print("\n====================================================")
print("  NORMES HACCP — Seed checklists par défaut")
print("====================================================\n")

# Auth
resp  = post("/api/v1/auth/login", {"email": "admin@demo.com", "password": "Password1!"})
TOKEN = resp.get("accessToken", "")
if not TOKEN:
    print("❌ Échec authentification — vérifiez les identifiants"); sys.exit(1)
print(f"✓ Authentifié: {resp.get('user', {}).get('email', '')}")

# Fetch templates (paginated with high limit)
print("\n[1/2] Récupération des modèles de contrôle...")
templates_resp = get("/api/v1/controls/templates?limit=200", TOKEN)
templates = templates_resp.get("data", [])
if not templates:
    # Try nested data structure
    templates = templates_resp.get("data", {}).get("items", []) if isinstance(templates_resp.get("data"), dict) else []
if not templates:
    print("  Aucun modèle trouvé. Tentative structure alternative...")
    templates = templates_resp if isinstance(templates_resp, list) else []

print(f"  {len(templates)} modèle(s) trouvé(s)")

# Update checklists
print("\n[2/2] Configuration des checklists...")
updated = 0
skipped = 0
unknown_type = 0

for tpl in templates:
    tpl_id   = tpl.get("id", "")
    tpl_name = tpl.get("name", "?")
    tpl_type = tpl.get("type", "")
    existing_checklist = tpl.get("checklistJson", [])

    # Ensure it's a list
    if not isinstance(existing_checklist, list):
        existing_checklist = []

    has_items = len(existing_checklist) > 0

    if has_items and not args.force:
        print(f"  ⏭  [{tpl_type}] {tpl_name} — déjà {len(existing_checklist)} item(s), ignoré (utilisez --force pour écraser)")
        skipped += 1
        continue

    default_items = DEFAULT_CHECKLISTS.get(tpl_type)
    if not default_items:
        print(f"  ❓  [{tpl_type}] {tpl_name} — type de contrôle non reconnu, ignoré")
        unknown_type += 1
        continue

    # Give each item a fresh ID to avoid duplicates
    items_to_save = []
    for item in default_items:
        i = dict(item)  # copy
        i["id"] = mk_id()
        items_to_save.append(i)

    result = patch(f"/api/v1/controls/templates/{tpl_id}", {"checklistJson": items_to_save}, TOKEN)
    if result.get("data") or result.get("id") or result.get("checklistJson") is not None:
        action = "mis à jour" if has_items else "configuré"
        print(f"  ✅  [{tpl_type}] {tpl_name} — {action} ({len(items_to_save)} items)")
        updated += 1
    else:
        print(f"  ⚠  [{tpl_type}] {tpl_name} — réponse inattendue: {str(result)[:100]}")
    time.sleep(0.1)  # small delay to avoid rate-limiting

print(f"""
====================================================
  Résumé
====================================================
  ✅ Configurés  : {updated}
  ⏭  Ignorés    : {skipped}
  ❓  Type inconnu: {unknown_type}
====================================================
""")

if updated > 0:
    print("✓ Les checklists ont été configurées.")
    print("  Les opérateurs peuvent maintenant exécuter les contrôles.")
if skipped > 0:
    print(f"  ℹ  {skipped} modèle(s) ignoré(s) car déjà configurés.")
    print("    Utilisez --force pour les écraser.")
