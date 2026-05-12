#!/usr/bin/env python3
"""
seed_zones_tasks.py - Correction: création zones + recréation tâches PMS avec vrais zone IDs
"""
import json, sys, io, time
from datetime import datetime, timedelta
import urllib.request, urllib.error

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

BASE_URL = "http://localhost:3001"

def req(method, path, body=None, token=""):
    url  = f"{BASE_URL}{path}"
    data = json.dumps(body).encode() if body else None
    hdrs = {"Content-Type": "application/json"}
    if token: hdrs["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  ⚠  HTTP {e.code} {method} {path}: {body[:150]}")
        return {}

def post(p,b,t): return req("POST",p,b,t)
def get(p,t):    return req("GET",p,None,t)

# ── Auth ──────────────────────────────────────────────────────────────────────
print("\n====================================================")
print("  HACCP — Création zones + tâches PMS corrigées")
print("====================================================\n")

resp  = post("/api/v1/auth/login", {"email":"admin@demo.com","password":"Password1!"}, "")
TOKEN = resp.get("accessToken","")
USER  = resp.get("user",{})
if not TOKEN:
    print("Échec auth"); sys.exit(1)
OPERATOR_ID = "clx_user_operator_01"
MANAGER_ID  = "clx_user_manager_01"
print(f"✓ Auth: {USER.get('email')}")

# ── Récupérer vrai site ID ────────────────────────────────────────────────────
sites_resp = get("/api/v1/sites", TOKEN)
sites = sites_resp.get("data", [])
if not sites:
    print("Aucun site trouvé!"); sys.exit(1)
SITE_ID = sites[0]["id"]
print(f"✓ Site: {sites[0]['name']} (id={SITE_ID})")

# Zones déjà existantes
ZONE_IDS = {}
for zone in sites[0].get("zones", []):
    ZONE_IDS[zone["name"]] = zone["id"]
    print(f"  Zone existante: {zone['name']} → {zone['id']}")

# ── Créer les nouvelles zones ─────────────────────────────────────────────────
print(f"\n[1/2] Création des zones sous site {SITE_ID}...")

NEW_ZONES = [
    "Boucherie / Découpe viandes",
    "Poissonnerie",
    "Pâtisserie / Viennoiserie",
    "Épicerie Fine / Épicerie Sèche",
    "Zone de Cuisson / Friture",
    "Légumerie / Préparation légumes",
    "Salle de Conditionnement",
    "Zone Plonge / Laverie",
    "Sanitaires du Personnel",
    "Chambre Froide Négative (Congélation)",
    "Quai de Réception / Contrôle qualité",
    "Laboratoire de Pâtisserie",
]

for name in NEW_ZONES:
    if name in ZONE_IDS:
        print(f"  = Déjà existante: {name}")
        continue
    r = post(f"/api/v1/sites/{SITE_ID}/zones", {"name": name}, TOKEN)
    zid = r.get("data", {}).get("id","?")
    if zid != "?":
        ZONE_IDS[name] = zid
        print(f"  ✓ {name} → {zid}")
    else:
        print(f"  ✗ Échec: {name}")
    time.sleep(0.1)

print(f"  Total zones disponibles: {len(ZONE_IDS)}")

# ── Récupérer les templates existants ─────────────────────────────────────────
def tmpl(fragment):
    r = get(f"/api/v1/controls/templates?limit=100", TOKEN)
    for item in r.get("data",[]):
        if fragment.lower() in item.get("name","").lower():
            return item["id"]
    return ""

def zone(fragment):
    for n, zid in ZONE_IDS.items():
        if fragment.lower() in n.lower() and zid != "?":
            return zid
    # Fallback: premier zone valide
    for zid in ZONE_IDS.values():
        if zid != "?":
            return zid
    return ""

# Charger tous les templates en une fois
all_templates_resp = get("/api/v1/controls/templates?limit=100", TOKEN)
TEMPLATE_IDS = {item["name"]: item["id"] for item in all_templates_resp.get("data",[])}
print(f"\n  Templates trouvés: {len(TEMPLATE_IDS)}")
for n in TEMPLATE_IDS:
    print(f"    - {n}")

def t(fragment):
    for n, tid in TEMPLATE_IDS.items():
        if fragment.lower() in n.lower():
            return tid
    return ""

# ── Zone aliases ──────────────────────────────────────────────────────────────
z_reception  = zone("réception") or zone("reception") or zone("Réception")
z_boucherie  = zone("boucherie")
z_poisson    = zone("poissonner")
z_patisserie = zone("pâtisserie") or zone("patisserie")
z_cuisson    = zone("cuisson") or zone("friture")
z_cuisine    = zone("production") or zone("cuisine") or z_reception
z_froid      = zone("froide") or zone("congélation") or zone("chambre") or z_reception
z_epicerie   = zone("épicerie") or zone("epicerie")

print(f"\n  Zones assignées:")
print(f"    z_reception  = {z_reception}")
print(f"    z_boucherie  = {z_boucherie}")
print(f"    z_poisson    = {z_poisson}")
print(f"    z_patisserie = {z_patisserie}")
print(f"    z_cuisson    = {z_cuisson}")
print(f"    z_cuisine    = {z_cuisine}")
print(f"    z_froid      = {z_froid}")
print(f"    z_epicerie   = {z_epicerie}")

# ── Planifier les tâches PMS ──────────────────────────────────────────────────
print(f"\n[2/2] Planification des tâches PMS (30 jours)...")

today = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)

def sched(days, hour=8):
    dt = today + timedelta(days=days)
    return dt.replace(hour=hour).isoformat() + "Z"

TASKS = []

# Quotidien: relevé températures CF (matin + après-midi, J+0 à J+29)
tc_cf  = t("Chambres froides")
tc_vit = t("Vitrines réfrigérées")
for day in range(30):
    if tc_cf and z_froid:
        TASKS += [
            {"templateId":tc_cf,"zoneId":z_froid,"assigneeId":OPERATOR_ID,"scheduledAt":sched(day,7)},
            {"templateId":tc_cf,"zoneId":z_froid,"assigneeId":OPERATOR_ID,"scheduledAt":sched(day,14)},
        ]
    if tc_vit and z_boucherie:
        TASKS += [
            {"templateId":tc_vit,"zoneId":z_boucherie,"assigneeId":OPERATOR_ID,"scheduledAt":sched(day,8)},
            {"templateId":tc_vit,"zoneId":z_boucherie,"assigneeId":OPERATOR_ID,"scheduledAt":sched(day,15)},
        ]

# Quotidien: huile friture
tc_huile = t("huile de friture")
if tc_huile and z_cuisson:
    for day in range(30):
        TASKS.append({"templateId":tc_huile,"zoneId":z_cuisson,"assigneeId":OPERATOR_ID,"scheduledAt":sched(day,10)})

# Quotidien: températures cuisson (midi + soir)
tc_cuisson = t("températures cuisson")
if tc_cuisson and z_cuisson:
    for day in range(30):
        TASKS += [
            {"templateId":tc_cuisson,"zoneId":z_cuisson,"assigneeId":OPERATOR_ID,"scheduledAt":sched(day,12)},
            {"templateId":tc_cuisson,"zoneId":z_cuisson,"assigneeId":OPERATOR_ID,"scheduledAt":sched(day,19)},
        ]

# Quotidien: hygiène personnelle
tc_hygiene = t("hygiène personnelle")
if tc_hygiene and z_cuisine:
    for day in range(30):
        TASKS.append({"templateId":tc_hygiene,"zoneId":z_cuisine,"assigneeId":MANAGER_ID,"scheduledAt":sched(day,7)})

# Quotidien: nettoyage cuisine fin service
tc_nettoyage_q = t("Nettoyage-Désinfection quotidien cuisine")
if tc_nettoyage_q and z_cuisine:
    for day in range(30):
        TASKS.append({"templateId":tc_nettoyage_q,"zoneId":z_cuisine,"assigneeId":OPERATOR_ID,"scheduledAt":sched(day,22)})

# Quotidien: nettoyage matériel boucherie
tc_nett_bc = t("boucherie")
if tc_nett_bc and z_boucherie:
    for day in range(30):
        TASKS.append({"templateId":tc_nett_bc,"zoneId":z_boucherie,"assigneeId":OPERATOR_ID,"scheduledAt":sched(day,18)})

# Quotidien: traçabilité production
tc_prod = t("traçabilité")
if tc_prod and z_cuisine:
    for day in range(30):
        TASKS.append({"templateId":tc_prod,"zoneId":z_cuisine,"assigneeId":MANAGER_ID,"scheduledAt":sched(day,17)})

# Par livraison: lundi + jeudi = viandes & laitiers / mardi + vendredi = poissons
tc_rec_viandes  = t("réception — Viandes")
tc_rec_poisson  = t("Poissons & Fruits de mer")
tc_rec_laitier  = t("Produits laitiers")
tc_rec_epicerie = t("Épicerie sèche")
for day in range(30):
    weekday = (today + timedelta(days=day)).weekday()
    zone_r = z_reception or z_cuisine
    if weekday in (0, 3) and zone_r:
        if tc_rec_viandes:  TASKS.append({"templateId":tc_rec_viandes, "zoneId":zone_r,"assigneeId":OPERATOR_ID,"scheduledAt":sched(day,8)})
        if tc_rec_laitier:  TASKS.append({"templateId":tc_rec_laitier, "zoneId":zone_r,"assigneeId":OPERATOR_ID,"scheduledAt":sched(day,8)})
    if weekday in (1, 4) and zone_r:
        if tc_rec_poisson:  TASKS.append({"templateId":tc_rec_poisson, "zoneId":zone_r,"assigneeId":OPERATOR_ID,"scheduledAt":sched(day,7)})
    if weekday == 2 and zone_r:
        if tc_rec_epicerie: TASKS.append({"templateId":tc_rec_epicerie,"zoneId":zone_r,"assigneeId":OPERATOR_ID,"scheduledAt":sched(day,9)})

# Hebdomadaire: nettoyage approfondi (tous les lundis)
tc_nettoyage_h = t("hebdomadaire approfondi")
if tc_nettoyage_h and z_cuisine:
    for week in range(4):
        TASKS.append({"templateId":tc_nettoyage_h,"zoneId":z_cuisine,"assigneeId":MANAGER_ID,"scheduledAt":sched(week*7,6)})

# Mensuel: maintenance équipements froid
tc_maint = t("Maintenance préventive équipements froid")
if tc_maint and z_froid:
    TASKS.append({"templateId":tc_maint,"zoneId":z_froid,"assigneeId":MANAGER_ID,"scheduledAt":sched(0,9)})
    TASKS.append({"templateId":tc_maint,"zoneId":z_froid,"assigneeId":MANAGER_ID,"scheduledAt":sched(30,9)})

# Filtrer invalides
TASKS = [t2 for t2 in TASKS if t2.get("templateId") and t2.get("zoneId") and t2["zoneId"] not in ("?","")]

print(f"  → {len(TASKS)} tâches à créer...")
ok, ko = 0, 0
for i, task in enumerate(TASKS):
    r = post("/api/v1/controls/tasks", task, TOKEN)
    if r.get("data", {}).get("id"):
        ok += 1
    else:
        ko += 1
    if (i+1) % 50 == 0:
        print(f"  ... {i+1}/{len(TASKS)}")
    time.sleep(0.05)

# ── Résumé ────────────────────────────────────────────────────────────────────
print(f"\n====================================================")
print(f"  TERMINÉ")
print(f"  Zones créées    : {len([z for z in ZONE_IDS.values() if z != '?'])}")
print(f"  Tâches PMS OK   : {ok}")
print(f"  Tâches échecs   : {ko}")
print(f"====================================================\n")
