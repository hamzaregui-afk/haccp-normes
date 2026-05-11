#!/usr/bin/env python3
"""
seed_referential.py - Population complete du referentiel HACCP
Plan de Maitrise Sanitaire (PMS) professionnel
"""
import json
import sys
import io
import time
from datetime import datetime, timedelta
import urllib.request
import urllib.error

# Force UTF-8 output to handle French characters on Windows cp1252 consoles
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

BASE_URL = "http://localhost:3001"
EMAIL    = "admin@demo.com"
PASSWORD = "Password1!"

# ─── HTTP helpers ──────────────────────────────────────────────────────────────

def req(method: str, path: str, body=None, token: str = "") -> dict:
    url  = f"{BASE_URL}{path}"
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  ⚠  HTTP {e.code} on {method} {path}: {body[:200]}")
        return {}

def post(path, body, token):  return req("POST",  path, body, token)
def get(path, token):          return req("GET",   path, None, token)

def created(resp, name=""):
    item = resp.get("data", {})
    iid  = item.get("id", "?")
    if iid != "?" and name:
        print(f"  ✓ {name} → {iid}")
    elif iid == "?":
        print(f"  ✗ Échec création {name}: {resp}")
    return iid

# ─── Auth ──────────────────────────────────────────────────────────────────────

print("\n" + "="*60)
print("  NORMES HACCP — Peuplement du référentiel PMS")
print("="*60)

print("\n[1/7] Authentification...")
resp  = post("/api/v1/auth/login", {"email": EMAIL, "password": PASSWORD}, "")
TOKEN = resp.get("accessToken", "")
USER  = resp.get("user", {})
if not TOKEN:
    print("  ✗ Échec auth. Vérifiez que l'app est lancée.")
    sys.exit(1)
TENANT_ID     = USER.get("tenantId", "")
OPERATOR_ID   = "clx_user_operator_01"
MANAGER_ID    = "clx_user_manager_01"
QUALITY_ID    = "clx_user_quality_01"
SITE_ID       = "clx_site_demo_01"
print(f"  ✓ Connecté: {USER.get('email')} (tenant: {TENANT_ID})")

# ─── Zones ────────────────────────────────────────────────────────────────────

print("\n[2/7] Création des zones...")

ZONES_TO_CREATE = [
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

ZONE_IDS = {}  # name → id
for name in ZONES_TO_CREATE:
    r = post(f"/api/v1/sites/{SITE_ID}/zones", {"name": name}, TOKEN)
    zid = created(r, name)
    ZONE_IDS[name] = zid
    time.sleep(0.1)

# Récupérer les zones existantes du seed
sites_resp = get("/api/v1/sites", TOKEN)
sites = sites_resp.get("data", []) if isinstance(sites_resp.get("data"), list) else []
existing_zones = []
for site in sites:
    for zone in site.get("zones", []):
        existing_zones.append(zone)
        ZONE_IDS[zone["name"]] = zone["id"]

# Alias pratiques pour les tâches
def zone(name_fragment: str) -> str:
    for n, zid in ZONE_IDS.items():
        if name_fragment.lower() in n.lower():
            return zid
    # Fallback: first zone
    return list(ZONE_IDS.values())[0] if ZONE_IDS else ""

# ─── Équipements ──────────────────────────────────────────────────────────────

print(f"\n[3/7] Création des équipements ({SITE_ID})...")

EQUIPMENTS = [
    # ── Froid positif ──
    {"code":"CF-VIA-001","name":"Chambre froide positive — Viandes","type":"Chambre froide","brand":"Copeland","tempMin":0,"tempMax":4},
    {"code":"CF-POI-001","name":"Chambre froide positive — Poissons","type":"Chambre froide","brand":"Copeland","tempMin":0,"tempMax":4},
    {"code":"CF-LEG-001","name":"Chambre froide positive — Légumes & Fruits","type":"Chambre froide","brand":"Carrier","tempMin":2,"tempMax":8},
    {"code":"CF-LAI-001","name":"Chambre froide positive — Produits laitiers","type":"Chambre froide","brand":"Carrier","tempMin":0,"tempMax":4},
    # ── Froid négatif ──
    {"code":"CN-SUR-001","name":"Chambre froide négative — Surgélation","type":"Congélateur","brand":"Copeland","tempMin":-25,"tempMax":-18},
    {"code":"CN-SUR-002","name":"Congélateur coffre — Produits finis","type":"Congélateur","brand":"Liebherr","tempMin":-25,"tempMax":-18},
    # ── Vitrines réfrigérées ──
    {"code":"VIT-BC-001","name":"Vitrine réfrigérée boucherie","type":"Vitrine réfrigérée","brand":"Jordao","tempMin":0,"tempMax":4},
    {"code":"VIT-POI-001","name":"Vitrine réfrigérée poissonnerie","type":"Vitrine réfrigérée","brand":"Jordao","tempMin":0,"tempMax":2},
    {"code":"VIT-PAT-001","name":"Vitrine réfrigérée pâtisserie","type":"Vitrine réfrigérée","brand":"Panorama","tempMin":4,"tempMax":8},
    {"code":"VIT-LAI-001","name":"Vitrine réfrigérée produits laitiers","type":"Vitrine réfrigérée","brand":"Panorama","tempMin":0,"tempMax":4},
    # ── Chaud ──
    {"code":"VIT-CH-001","name":"Vitrine chauffante plats cuisinés","type":"Vitrine chaude","brand":"Roller Grill","tempMin":63,"tempMax":80},
    {"code":"BM-CH-001","name":"Bain-marie professionnel","type":"Bain-marie","brand":"Stalgast","tempMin":63,"tempMax":85},
    # ── Cuisson ──
    {"code":"FRY-001","name":"Friteuse professionnelle double cuve","type":"Friteuse","brand":"Frima","serialNumber":"FRY2024001"},
    {"code":"FRY-002","name":"Friteuse professionnelle simple cuve","type":"Friteuse","brand":"Frima","serialNumber":"FRY2024002"},
    {"code":"FOU-001","name":"Four à convection polyvalent","type":"Four","brand":"Rational","serialNumber":"RAT2023001"},
    {"code":"FOU-002","name":"Four à pain boulangerie","type":"Four","brand":"Miwe","serialNumber":"MIW2022001"},
    {"code":"FOU-003","name":"Four à pizza","type":"Four","brand":"Moretti Forni","serialNumber":"MOR2024001"},
    {"code":"GRI-001","name":"Gril plancha professionnel","type":"Gril","brand":"Adventys"},
    {"code":"CUI-001","name":"Cuisinière professionnelle 6 feux","type":"Cuisinière","brand":"Charvet","serialNumber":"CHV2021001"},
    # ── Transformation ──
    {"code":"HAC-001","name":"Hachoir à viande professionnel","type":"Hachoir","brand":"Reber","serialNumber":"REB2023001"},
    {"code":"TRA-001","name":"Trancheur à jambon / charcuterie","type":"Trancheur","brand":"Berkel","serialNumber":"BER2022001"},
    {"code":"ROB-001","name":"Robot-coupe professionnel pâtisserie","type":"Robot","brand":"Robot-Coupe","serialNumber":"RC2023001"},
    {"code":"PET-001","name":"Pétrin boulangerie 20L","type":"Pétrin","brand":"Euromix","serialNumber":"EUR2022001"},
    {"code":"VAC-001","name":"Machine sous-vide professionnelle","type":"Machine sous-vide","brand":"Henkelman","serialNumber":"HEN2023001"},
    # ── Hygiène ──
    {"code":"LAV-001","name":"Lave-mains inox à commande non manuelle — Réception","type":"Lave-mains","brand":"Inox line"},
    {"code":"LAV-002","name":"Lave-mains inox — Boucherie","type":"Lave-mains","brand":"Inox line"},
    {"code":"LVA-001","name":"Lave-vaisselle professionnel tunnel","type":"Lave-vaisselle","brand":"Winterhalter","serialNumber":"WIN2021001"},
    {"code":"DES-001","name":"Station de désinfection gel hydroalcoolique","type":"Désinfection","brand":"Saraya"},
    # ── Mesure / contrôle ──
    {"code":"SON-001","name":"Sonde thermométrique HACCP — Cuisine","type":"Sonde thermométrique","brand":"Testo","serialNumber":"TES2024001"},
    {"code":"SON-002","name":"Sonde thermométrique HACCP — Réception","type":"Sonde thermométrique","brand":"Testo","serialNumber":"TES2024002"},
    {"code":"SON-003","name":"Enregistreur de température continu — CF Viandes","type":"Enregistreur température","brand":"Testo","serialNumber":"TES2024003"},
    {"code":"BAL-001","name":"Balance de précision laboratoire","type":"Balance","brand":"Mettler Toledo","serialNumber":"MTL2023001"},
]

EQUIP_IDS = {}
for eq in EQUIPMENTS:
    payload = {"code": eq["code"], "name": eq["name"], "type": eq.get("type"), "brand": eq.get("brand"), "serialNumber": eq.get("serialNumber"), "siteId": SITE_ID}
    if "tempMin" in eq: payload["tempMin"] = eq["tempMin"]
    if "tempMax" in eq: payload["tempMax"] = eq["tempMax"]
    r = post("/api/v1/equipments", {k:v for k,v in payload.items() if v is not None}, TOKEN)
    eid = created(r, eq["name"])
    EQUIP_IDS[eq["code"]] = eid
    time.sleep(0.08)

# ─── Produits alimentaires (matières premières) ───────────────────────────────

print("\n[4/7] Création des produits alimentaires...")

PRODUCTS = [
    # ── Viandes ──
    {"code":"VIA-BOE-001","name":"Bœuf haché frais (80% maigre)","category":"Viandes","tempStorage":4,"dlcDays":2,"packaging":"Barquette 500g"},
    {"code":"VIA-BOE-002","name":"Steak bœuf — côte de bœuf","category":"Viandes","tempStorage":4,"dlcDays":3,"packaging":"Pièce entière"},
    {"code":"VIA-POE-001","name":"Poulet entier frais","category":"Viandes","tempStorage":4,"dlcDays":3,"packaging":"Pièce entière"},
    {"code":"VIA-POE-002","name":"Filet de poulet frais","category":"Viandes","tempStorage":4,"dlcDays":3,"packaging":"Barquette 1kg"},
    {"code":"VIA-POR-001","name":"Côtes de porc fraîches","category":"Viandes","tempStorage":4,"dlcDays":3,"packaging":"Barquette 1kg"},
    {"code":"VIA-POR-002","name":"Jambon blanc cuit — tranche","category":"Viandes","tempStorage":4,"dlcDays":5,"packaging":"Sachet 200g"},
    {"code":"VIA-AGN-001","name":"Épaule d'agneau fraîche","category":"Viandes","tempStorage":4,"dlcDays":3,"packaging":"Pièce entière"},
    {"code":"VIA-VEA-001","name":"Escalope de veau fraîche","category":"Viandes","tempStorage":4,"dlcDays":3,"packaging":"Barquette 500g"},
    {"code":"VIA-DIN-001","name":"Cuisse de dinde fraîche","category":"Viandes","tempStorage":4,"dlcDays":3,"packaging":"Barquette 1kg"},
    {"code":"VIA-LAP-001","name":"Lapin entier frais","category":"Viandes","tempStorage":4,"dlcDays":2,"packaging":"Pièce entière"},
    # ── Poissons & fruits de mer ──
    {"code":"POI-SAU-001","name":"Filet de saumon frais Atlantique","category":"Poissons & Fruits de mer","tempStorage":2,"dlcDays":2,"packaging":"Pièce 200-300g"},
    {"code":"POI-THO-001","name":"Thon frais — steak","category":"Poissons & Fruits de mer","tempStorage":2,"dlcDays":1,"packaging":"Pièce 200g"},
    {"code":"POI-CAB-001","name":"Filet de cabillaud frais","category":"Poissons & Fruits de mer","tempStorage":2,"dlcDays":2,"packaging":"Pièce 200g"},
    {"code":"POI-SAR-001","name":"Sardines fraîches entières","category":"Poissons & Fruits de mer","tempStorage":2,"dlcDays":1,"packaging":"Kg vrac"},
    {"code":"POI-CRE-001","name":"Crevettes fraîches (bouquet)","category":"Poissons & Fruits de mer","tempStorage":2,"dlcDays":2,"packaging":"Barquette 500g"},
    {"code":"POI-MOU-001","name":"Moules fraîches — filière Bouchot","category":"Poissons & Fruits de mer","tempStorage":4,"dlcDays":3,"packaging":"Filet 1kg"},
    {"code":"POI-HUI-001","name":"Huîtres creuses N°3","category":"Poissons & Fruits de mer","tempStorage":4,"dlcDays":7,"packaging":"Bourriche 12"},
    {"code":"POI-LAN-001","name":"Langoustines fraîches","category":"Poissons & Fruits de mer","tempStorage":2,"dlcDays":1,"packaging":"Kg vrac"},
    # ── Produits laitiers & œufs ──
    {"code":"LAI-ENT-001","name":"Lait entier frais pasteurisé","category":"Produits laitiers","tempStorage":4,"dlcDays":7,"packaging":"Bouteille 1L"},
    {"code":"LAI-CRM-001","name":"Crème fraîche épaisse 30%","category":"Produits laitiers","tempStorage":4,"dlcDays":21,"packaging":"Pot 500g"},
    {"code":"LAI-CRL-001","name":"Crème liquide UHT 35%","category":"Produits laitiers","dlcDays":90,"packaging":"Brique 1L"},
    {"code":"LAI-BEU-001","name":"Beurre doux (82% MG)","category":"Produits laitiers","tempStorage":4,"dlcDays":60,"packaging":"Plaquette 250g"},
    {"code":"LAI-EMM-001","name":"Fromage emmental râpé","category":"Produits laitiers","tempStorage":4,"dlcDays":30,"packaging":"Sachet 1kg"},
    {"code":"LAI-MOZ-001","name":"Mozzarella fraîche","category":"Produits laitiers","tempStorage":4,"dlcDays":14,"packaging":"Boule 125g"},
    {"code":"LAI-CAM-001","name":"Camembert de Normandie AOP","category":"Produits laitiers","tempStorage":4,"dlcDays":21,"packaging":"Boîte 250g"},
    {"code":"LAI-CHV-001","name":"Fromage de chèvre frais","category":"Produits laitiers","tempStorage":4,"dlcDays":14,"packaging":"Bûche 200g"},
    {"code":"LAI-YAO-001","name":"Yaourt nature brassé","category":"Produits laitiers","tempStorage":4,"dlcDays":21,"packaging":"Pot 125g"},
    {"code":"LAI-OEU-001","name":"Œufs frais calibre L (catégorie A)","category":"Produits laitiers","tempStorage":4,"dlcDays":28,"packaging":"Boîte 12"},
    # ── Légumes & fruits ──
    {"code":"LEG-TOM-001","name":"Tomates rondes fraîches","category":"Fruits & Légumes","tempStorage":8,"dlcDays":7,"packaging":"Kg vrac"},
    {"code":"LEG-CAR-001","name":"Carottes fraîches — botte","category":"Fruits & Légumes","tempStorage":8,"dlcDays":14,"packaging":"Botte 1kg"},
    {"code":"LEG-PDT-001","name":"Pommes de terre (variété Bintje)","category":"Fruits & Légumes","dlcDays":60,"packaging":"Sac 10kg"},
    {"code":"LEG-OIG-001","name":"Oignons jaunes","category":"Fruits & Légumes","dlcDays":60,"packaging":"Filet 5kg"},
    {"code":"LEG-SAL-001","name":"Salade verte — laitue","category":"Fruits & Légumes","tempStorage":4,"dlcDays":5,"packaging":"Pièce"},
    {"code":"LEG-POI-001","name":"Poivrons tricolores","category":"Fruits & Légumes","tempStorage":8,"dlcDays":10,"packaging":"Kg vrac"},
    {"code":"LEG-CHA-001","name":"Champignons de Paris frais","category":"Fruits & Légumes","tempStorage":4,"dlcDays":5,"packaging":"Barquette 500g"},
    {"code":"LEG-AIL-001","name":"Ail frais tête","category":"Fruits & Légumes","dlcDays":90,"packaging":"Tête"},
    {"code":"LEG-EPI-001","name":"Épinards frais en branches","category":"Fruits & Légumes","tempStorage":4,"dlcDays":3,"packaging":"Botte 500g"},
    {"code":"LEG-COU-001","name":"Courgettes fraîches","category":"Fruits & Légumes","tempStorage":8,"dlcDays":7,"packaging":"Kg vrac"},
    {"code":"LEG-AVO-001","name":"Avocats Hass","category":"Fruits & Légumes","tempStorage":8,"dlcDays":5,"packaging":"Pièce"},
    {"code":"LEG-CIT-001","name":"Citrons jaunes","category":"Fruits & Légumes","dlcDays":30,"packaging":"Filet 1kg"},
    # ── Épicerie sèche ──
    {"code":"EPI-RIZ-001","name":"Riz basmati extra-long","category":"Épicerie sèche","dlcDays":730,"packaging":"Sac 5kg"},
    {"code":"EPI-FAR-001","name":"Farine de blé T55 (boulangerie)","category":"Épicerie sèche","dlcDays":365,"packaging":"Sac 25kg"},
    {"code":"EPI-FAR-002","name":"Farine de blé T45 (pâtisserie)","category":"Épicerie sèche","dlcDays":365,"packaging":"Sac 10kg"},
    {"code":"EPI-SUC-001","name":"Sucre blanc cristallisé","category":"Épicerie sèche","dlcDays":1825,"packaging":"Sac 5kg"},
    {"code":"EPI-SUC-002","name":"Sucre glace","category":"Épicerie sèche","dlcDays":365,"packaging":"Sac 1kg"},
    {"code":"EPI-SEL-001","name":"Sel fin de cuisine","category":"Épicerie sèche","dlcDays":1825,"packaging":"Sac 1kg"},
    {"code":"EPI-HUI-001","name":"Huile d'olive vierge extra","category":"Épicerie sèche","dlcDays":730,"packaging":"Bidon 5L"},
    {"code":"EPI-HUT-001","name":"Huile de tournesol haute oléique (friture)","category":"Épicerie sèche","dlcDays":365,"packaging":"Bidon 10L"},
    {"code":"EPI-PAT-001","name":"Pâtes sèches rigate","category":"Épicerie sèche","dlcDays":730,"packaging":"Paquet 5kg"},
    {"code":"EPI-LEN-001","name":"Lentilles vertes du Puy","category":"Épicerie sèche","dlcDays":730,"packaging":"Sac 1kg"},
    {"code":"EPI-CHO-001","name":"Chocolat noir 70% de cacao","category":"Épicerie sèche","dlcDays":365,"packaging":"Tablette 1kg"},
    {"code":"EPI-LEV-001","name":"Levure boulangère sèche active","category":"Épicerie sèche","dlcDays":365,"packaging":"Sachet 500g"},
    {"code":"EPI-AID-001","name":"Amidon de maïs (Maïzena)","category":"Épicerie sèche","dlcDays":730,"packaging":"Boîte 1kg"},
    # ── Surgelés ──
    {"code":"SUR-FRI-001","name":"Frites surgelées calibre 10/10","category":"Surgelés","tempStorage":-18,"dlcDays":270,"packaging":"Sac 5kg"},
    {"code":"SUR-LEG-001","name":"Mélange légumes surgelés 4 couleurs","category":"Surgelés","tempStorage":-18,"dlcDays":365,"packaging":"Sac 2.5kg"},
    {"code":"SUR-GLA-001","name":"Glace vanille bourbon","category":"Surgelés","tempStorage":-18,"dlcDays":270,"packaging":"Bac 5L"},
    {"code":"SUR-PAN-001","name":"Pâte feuilletée surgelée","category":"Surgelés","tempStorage":-18,"dlcDays":365,"packaging":"Rouleau 1kg"},
    # ── Boissons ──
    {"code":"BOI-EAU-001","name":"Eau minérale plate","category":"Boissons","dlcDays":365,"packaging":"Bouteille 1.5L"},
    {"code":"BOI-JUS-001","name":"Jus d'orange 100% pur jus","category":"Boissons","tempStorage":4,"dlcDays":7,"packaging":"Bouteille 1L"},
    # ── Condiments & épices ──
    {"code":"CON-POI-001","name":"Poivre noir moulu","category":"Condiments & Épices","dlcDays":730,"packaging":"Pot 500g"},
    {"code":"CON-TYM-001","name":"Thym séché","category":"Condiments & Épices","dlcDays":730,"packaging":"Pot 200g"},
    {"code":"CON-MOU-001","name":"Moutarde de Dijon","category":"Condiments & Épices","dlcDays":365,"packaging":"Pot 1kg"},
    {"code":"CON-VIN-001","name":"Vinaigre balsamique","category":"Condiments & Épices","dlcDays":1095,"packaging":"Bouteille 1L"},
    {"code":"CON-KET-001","name":"Ketchup tomate","category":"Condiments & Épices","dlcDays":365,"packaging":"Bouteille 1L"},
]

PROD_IDS = {}
for prod in PRODUCTS:
    payload = {k:v for k,v in prod.items() if v is not None}
    r = post("/api/v1/products", payload, TOKEN)
    pid = created(r, prod["name"])
    PROD_IDS[prod["code"]] = pid
    time.sleep(0.08)

# ─── Contrôles (templates) ────────────────────────────────────────────────────

print("\n[5/7] Création des templates de contrôle...")

TEMPLATES = [
    # ── RECEPTION ──
    {
        "name": "Contrôle réception — Viandes fraîches",
        "type": "RECEPTION",
        "frequency": "Chaque livraison",
        "checklistJson": [
            {"id":1,"label":"Vérifier intégrité emballage (absence de chocs, déchirures)","required":True},
            {"id":2,"label":"Mesurer la température à cœur (≤ +4°C)","required":True,"hasMeasure":True,"unit":"°C","limitMin":-1,"limitMax":4},
            {"id":3,"label":"Contrôler la DLC / DLUO sur chaque colis","required":True},
            {"id":4,"label":"Vérifier l'étiquetage réglementaire (N° lot, origine)","required":True},
            {"id":5,"label":"Contrôle organoleptique : couleur, odeur, texture","required":True},
            {"id":6,"label":"Vérifier la propreté du véhicule de livraison","required":True},
            {"id":7,"label":"Valider le bon de livraison et signer le BL","required":True},
        ],
    },
    {
        "name": "Contrôle réception — Poissons & Fruits de mer",
        "type": "RECEPTION",
        "frequency": "Chaque livraison",
        "checklistJson": [
            {"id":1,"label":"Température du poisson à réception (≤ 0°C)","required":True,"hasMeasure":True,"unit":"°C","limitMin":-2,"limitMax":2},
            {"id":2,"label":"Aspect de l'œil (brillant, non enfoncé)","required":True},
            {"id":3,"label":"Coloration des branchies (rouge vif)","required":True},
            {"id":4,"label":"Odeur iodée, absence d'odeur ammoniaquée","required":True},
            {"id":5,"label":"Fermeté chair (rigidité cadavérique présente)","required":True},
            {"id":6,"label":"Vérifier DLC et numéro de lot","required":True},
            {"id":7,"label":"Vérifier étiquetage zone de pêche / méthode de pêche","required":True},
            {"id":8,"label":"Stocker immédiatement en chambre froide ≤ 2°C","required":True},
        ],
    },
    {
        "name": "Contrôle réception — Produits laitiers & Œufs",
        "type": "RECEPTION",
        "frequency": "Chaque livraison",
        "checklistJson": [
            {"id":1,"label":"Température réception (≤ +4°C)","required":True,"hasMeasure":True,"unit":"°C","limitMin":0,"limitMax":4},
            {"id":2,"label":"Vérifier DLC sur chaque produit","required":True},
            {"id":3,"label":"Intégrité emballage (absence de gonflement, fuites)","required":True},
            {"id":4,"label":"Aspect général (couleur, odeur normale)","required":True},
            {"id":5,"label":"Propreté des œufs (absence de souillures)","required":True},
            {"id":6,"label":"Vérifier catégorie et numéro de lot","required":True},
        ],
    },
    {
        "name": "Contrôle réception — Épicerie sèche & Surgelés",
        "type": "RECEPTION",
        "frequency": "Chaque livraison",
        "checklistJson": [
            {"id":1,"label":"Températures surgelés à réception (≤ -15°C)","required":True,"hasMeasure":True,"unit":"°C","limitMin":-30,"limitMax":-15},
            {"id":2,"label":"Emballages surgelés intacts (absence cristaux glace)","required":True},
            {"id":3,"label":"Vérifier DLUO produits secs","required":True},
            {"id":4,"label":"Absence nuisibles / insectes dans colis","required":True},
            {"id":5,"label":"Stockage immédiat surgelés en chambre négative","required":True},
        ],
    },
    # ── TEMPERATURE_STOCK ──
    {
        "name": "Relevé températures — Chambres froides",
        "type": "TEMPERATURE_STOCK",
        "frequency": "2 fois par jour",
        "checklistJson": [
            {"id":1,"label":"CF Viandes : température relevée (0 à +4°C)","required":True,"hasMeasure":True,"unit":"°C","limitMin":0,"limitMax":4},
            {"id":2,"label":"CF Poissons : température relevée (0 à +2°C)","required":True,"hasMeasure":True,"unit":"°C","limitMin":0,"limitMax":2},
            {"id":3,"label":"CF Légumes : température relevée (+2 à +8°C)","required":True,"hasMeasure":True,"unit":"°C","limitMin":2,"limitMax":8},
            {"id":4,"label":"CF Produits laitiers : température relevée (0 à +4°C)","required":True,"hasMeasure":True,"unit":"°C","limitMin":0,"limitMax":4},
            {"id":5,"label":"Congélateur : température relevée (-18°C ou moins)","required":True,"hasMeasure":True,"unit":"°C","limitMin":-30,"limitMax":-18},
            {"id":6,"label":"Vérifier propreté des joints de portes","required":False},
            {"id":7,"label":"Vérifier absence de givre excessif","required":False},
        ],
    },
    # ── TEMPERATURE_DISPLAY ──
    {
        "name": "Relevé températures — Vitrines réfrigérées",
        "type": "TEMPERATURE_DISPLAY",
        "frequency": "2 fois par jour",
        "checklistJson": [
            {"id":1,"label":"Vitrine boucherie : température (0 à +4°C)","required":True,"hasMeasure":True,"unit":"°C","limitMin":0,"limitMax":4},
            {"id":2,"label":"Vitrine poissonnerie : température (0 à +2°C)","required":True,"hasMeasure":True,"unit":"°C","limitMin":0,"limitMax":2},
            {"id":3,"label":"Vitrine pâtisserie : température (+4 à +8°C)","required":True,"hasMeasure":True,"unit":"°C","limitMin":4,"limitMax":8},
            {"id":4,"label":"Vitrine produits laitiers : température (0 à +4°C)","required":True,"hasMeasure":True,"unit":"°C","limitMin":0,"limitMax":4},
            {"id":5,"label":"Vitrine chaude : température plats (≥ +63°C)","required":True,"hasMeasure":True,"unit":"°C","limitMin":63,"limitMax":80},
            {"id":6,"label":"Vérifier propreté des vitrines et éclairage","required":False},
        ],
    },
    # ── TEMPERATURE_OIL ──
    {
        "name": "Contrôle huile de friture (test polaires + température)",
        "type": "TEMPERATURE_OIL",
        "frequency": "Quotidien",
        "checklistJson": [
            {"id":1,"label":"Température de chauffe friteuse 1 (160-180°C)","required":True,"hasMeasure":True,"unit":"°C","limitMin":160,"limitMax":180},
            {"id":2,"label":"Température de chauffe friteuse 2 (160-180°C)","required":True,"hasMeasure":True,"unit":"°C","limitMin":160,"limitMax":180},
            {"id":3,"label":"Test taux polaires friteuse 1 (seuil : ≤ 25%)","required":True,"hasMeasure":True,"unit":"%","limitMin":0,"limitMax":25},
            {"id":4,"label":"Test taux polaires friteuse 2 (seuil : ≤ 25%)","required":True,"hasMeasure":True,"unit":"%","limitMin":0,"limitMax":25},
            {"id":5,"label":"Aspect visuel huile (absence de mousse, couleur normale)","required":True},
            {"id":6,"label":"Décision : renouvellement huile si taux > 25%","required":True},
            {"id":7,"label":"Nettoyage paniers et cuve en fin de service","required":True},
        ],
    },
    # ── EQUIPMENT ──
    {
        "name": "Nettoyage-Désinfection matériel boucherie (hachoir, trancheur)",
        "type": "EQUIPMENT",
        "frequency": "Quotidien (après chaque utilisation)",
        "checklistJson": [
            {"id":1,"label":"Démontage complet hachoir (vis sans fin, couteau, grille)","required":True},
            {"id":2,"label":"Pré-rinçage eau froide (élimination résidus viandes)","required":True},
            {"id":3,"label":"Nettoyage détergent alimentaire (laisser agir 5 min)","required":True},
            {"id":4,"label":"Rinçage eau chaude (≥ 65°C)","required":True},
            {"id":5,"label":"Désinfection spray biocide alimentaire (contact 2 min)","required":True},
            {"id":6,"label":"Rinçage final eau potable","required":True},
            {"id":7,"label":"Séchage et remontage en zone propre","required":True},
            {"id":8,"label":"Traçabilité désinfection sur plan de nettoyage","required":True},
        ],
    },
    {
        "name": "Maintenance préventive équipements froid",
        "type": "EQUIPMENT",
        "frequency": "Mensuel",
        "checklistJson": [
            {"id":1,"label":"Vérification état joints portes (absence déchirures)","required":True},
            {"id":2,"label":"Nettoyage condenseurs (dépoussiérage)","required":True},
            {"id":3,"label":"Vérification système d'évacuation eaux (bac collecteur)","required":True},
            {"id":4,"label":"Dégivrage manuel si givre excessif","required":False},
            {"id":5,"label":"Vérification éclairage intérieur","required":False},
            {"id":6,"label":"Contrôle capteur température (étalonnage sonde)","required":True},
            {"id":7,"label":"Vérification fermeture hermétique portes","required":True},
        ],
    },
    # ── SANITARY ──
    {
        "name": "Nettoyage-Désinfection quotidien cuisine",
        "type": "SANITARY",
        "frequency": "Quotidien (fin de service)",
        "checklistJson": [
            {"id":1,"label":"Nettoyage et désinfection plans de travail inox","required":True},
            {"id":2,"label":"Nettoyage cuisinière et fours (intérieur et extérieur)","required":True},
            {"id":3,"label":"Nettoyage sol (balayage + lavage + désinfection)","required":True},
            {"id":4,"label":"Nettoyage murs et carrelage (projections)","required":True},
            {"id":5,"label":"Nettoyage et désinfection éviers et siphons","required":True},
            {"id":6,"label":"Vider et nettoyer les bacs à graisse","required":True},
            {"id":7,"label":"Remplacement des huiles de friture si nécessaire","required":False},
            {"id":8,"label":"Nettoyage hottes et filtres","required":False},
            {"id":9,"label":"Gestion déchets : poubelles vidées et nettoyées","required":True},
        ],
    },
    {
        "name": "Nettoyage-Désinfection hebdomadaire approfondi",
        "type": "SANITARY",
        "frequency": "Hebdomadaire",
        "checklistJson": [
            {"id":1,"label":"Démontage et nettoyage complet des grilles fours","required":True},
            {"id":2,"label":"Dégraissage approfondi hottes et conduits","required":True},
            {"id":3,"label":"Nettoyage intérieur chambres froides (parois, étagères)","required":True},
            {"id":4,"label":"Nettoyage et désinfection lave-vaisselle (bras rotatifs)","required":True},
            {"id":5,"label":"Nettoyage approfondi des sols (brossage calfeutrage)","required":True},
            {"id":6,"label":"Nettoyage zones peu accessibles (coins, plinthes)","required":True},
            {"id":7,"label":"Vérification produits d'hygiène (stocks, dates ouverture)","required":True},
            {"id":8,"label":"Contrôle et rotation produits FIFO en chambres froides","required":True},
        ],
    },
    {
        "name": "Contrôle hygiène personnelle & sanitaires",
        "type": "SANITARY",
        "frequency": "Quotidien",
        "checklistJson": [
            {"id":1,"label":"Vérification tenues propres du personnel (blouse, calot)","required":True},
            {"id":2,"label":"Contrôle lavage de mains effectif avant prise de poste","required":True},
            {"id":3,"label":"Nettoyage et désinfection WC du personnel","required":True},
            {"id":4,"label":"Renouvellement savons, papier, gel hydroalcoolique","required":True},
            {"id":5,"label":"Absence bijoux / montre en zone de manipulation aliments","required":True},
            {"id":6,"label":"Vérification plaies protégées (pansements bleus)","required":False},
        ],
    },
    # ── DAILY_PRODUCTION ──
    {
        "name": "Contrôle températures cuisson et remise en température",
        "type": "DAILY_PRODUCTION",
        "frequency": "Chaque préparation",
        "checklistJson": [
            {"id":1,"label":"Température à cœur viandes rouges (≥ +63°C)","required":True,"hasMeasure":True,"unit":"°C","limitMin":63,"limitMax":90},
            {"id":2,"label":"Température à cœur volailles (≥ +74°C)","required":True,"hasMeasure":True,"unit":"°C","limitMin":74,"limitMax":90},
            {"id":3,"label":"Température à cœur poissons (≥ +63°C)","required":True,"hasMeasure":True,"unit":"°C","limitMin":63,"limitMax":90},
            {"id":4,"label":"Température maintien au chaud (≥ +63°C)","required":True,"hasMeasure":True,"unit":"°C","limitMin":63,"limitMax":80},
            {"id":5,"label":"Refroidissement rapide (60→+10°C en < 2h)","required":True},
            {"id":6,"label":"Étiquetage productions (date fab., DLC, lot)","required":True},
        ],
    },
    {
        "name": "Enregistrement production journalière & traçabilité",
        "type": "DAILY_PRODUCTION",
        "frequency": "Quotidien",
        "checklistJson": [
            {"id":1,"label":"Enregistrement des matières premières utilisées (références, lots)","required":True},
            {"id":2,"label":"Pesées et enregistrement des quantités produites","required":True},
            {"id":3,"label":"Étiquetage de toutes les productions (DLC J+x)","required":True},
            {"id":4,"label":"Vérification des stocks avant production","required":True},
            {"id":5,"label":"Respect de la marche en avant","required":True},
            {"id":6,"label":"Signature fiche de production par responsable","required":True},
        ],
    },
]

TEMPLATE_IDS = {}
for tmpl in TEMPLATES:
    r = post("/api/v1/controls/templates", {
        "name": tmpl["name"],
        "type": tmpl["type"],
        "frequency": tmpl.get("frequency",""),
        "checklistJson": tmpl["checklistJson"],
    }, TOKEN)
    tid = created(r, tmpl["name"])
    TEMPLATE_IDS[tmpl["name"]] = tid
    time.sleep(0.1)

# ─── Tâches planifiées (PMS) ──────────────────────────────────────────────────

print("\n[6/7] Planification des tâches PMS (30 jours)...")

today = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)

def sched(days_offset: int, hour: int = 8) -> str:
    dt = today + timedelta(days=days_offset)
    return dt.replace(hour=hour).isoformat() + "Z"

def tmpl(name_fragment: str) -> str:
    for n, tid in TEMPLATE_IDS.items():
        if name_fragment.lower() in n.lower():
            return tid
    return ""

# Zone aliases
z_reception  = zone("réception") or zone("reception") or zone("Réception")
z_boucherie  = zone("boucherie")
z_poisson    = zone("poissonner")
z_patisserie = zone("pâtisserie") or zone("patisserie")
z_cuisson    = zone("cuisson") or zone("friture")
z_cuisine    = zone("cuisine") or zone("stockage") or z_reception
z_froid      = zone("froid") or zone("congélation") or z_reception
z_epicerie   = zone("épicerie") or zone("epicerie")

TASKS = []

# ── Quotidien : relevé températures (2×/jour, J+0 à J+29) ──
t_temp_cf   = tmpl("Chambres froides")
t_temp_vit  = tmpl("Vitrines réfrigérées")
for day in range(30):
    if t_temp_cf:
        TASKS.append({"templateId": t_temp_cf,   "zoneId": z_froid,     "assigneeId": OPERATOR_ID, "scheduledAt": sched(day, 7)})
        TASKS.append({"templateId": t_temp_cf,   "zoneId": z_froid,     "assigneeId": OPERATOR_ID, "scheduledAt": sched(day, 14)})
    if t_temp_vit:
        TASKS.append({"templateId": t_temp_vit,  "zoneId": z_boucherie or z_froid, "assigneeId": OPERATOR_ID, "scheduledAt": sched(day, 8)})
        TASKS.append({"templateId": t_temp_vit,  "zoneId": z_boucherie or z_froid, "assigneeId": OPERATOR_ID, "scheduledAt": sched(day, 15)})

# ── Quotidien : contrôle huile de friture (1×/jour) ──
t_huile = tmpl("huile de friture")
if t_huile and z_cuisson:
    for day in range(30):
        TASKS.append({"templateId": t_huile, "zoneId": z_cuisson, "assigneeId": OPERATOR_ID, "scheduledAt": sched(day, 10)})

# ── Quotidien : températures cuisson (chaque service midi et soir) ──
t_cuisson = tmpl("températures cuisson")
if t_cuisson and z_cuisson:
    for day in range(30):
        TASKS.append({"templateId": t_cuisson, "zoneId": z_cuisson, "assigneeId": OPERATOR_ID, "scheduledAt": sched(day, 12)})
        TASKS.append({"templateId": t_cuisson, "zoneId": z_cuisson, "assigneeId": OPERATOR_ID, "scheduledAt": sched(day, 19)})

# ── Quotidien : hygiène personnelle ──
t_hygiene = tmpl("hygiène personnelle")
if t_hygiene:
    for day in range(30):
        TASKS.append({"templateId": t_hygiene, "zoneId": z_cuisine, "assigneeId": MANAGER_ID, "scheduledAt": sched(day, 7)})

# ── Quotidien : nettoyage cuisine (fin de service) ──
t_nettoyage_q = tmpl("Nettoyage-Désinfection quotidien cuisine")
if t_nettoyage_q:
    for day in range(30):
        TASKS.append({"templateId": t_nettoyage_q, "zoneId": z_cuisine, "assigneeId": OPERATOR_ID, "scheduledAt": sched(day, 22)})

# ── Quotidien : nettoyage matériel boucherie ──
t_nett_bc = tmpl("boucherie")
if t_nett_bc and z_boucherie:
    for day in range(30):
        TASKS.append({"templateId": t_nett_bc, "zoneId": z_boucherie, "assigneeId": OPERATOR_ID, "scheduledAt": sched(day, 18)})

# ── Quotidien : traçabilité production ──
t_prod = tmpl("traçabilité")
if t_prod and z_cuisine:
    for day in range(30):
        TASKS.append({"templateId": t_prod, "zoneId": z_cuisine, "assigneeId": MANAGER_ID, "scheduledAt": sched(day, 17)})

# ── Chaque livraison (lundi + jeudi) : réception viandes ──
t_rec_viandes = tmpl("réception — Viandes")
t_rec_poisson = tmpl("Poissons & Fruits de mer")
t_rec_laitier = tmpl("Produits laitiers")
t_rec_epicerie = tmpl("Épicerie sèche")
for day in range(30):
    weekday = (today + timedelta(days=day)).weekday()
    if weekday in (0, 3):  # Lundi, Jeudi
        for t in [t_rec_viandes, t_rec_laitier]:
            if t:
                TASKS.append({"templateId": t, "zoneId": z_reception, "assigneeId": OPERATOR_ID, "scheduledAt": sched(day, 8)})
    if weekday in (1, 4):  # Mardi, Vendredi
        if t_rec_poisson:
            TASKS.append({"templateId": t_rec_poisson, "zoneId": z_reception, "assigneeId": OPERATOR_ID, "scheduledAt": sched(day, 7)})
    if weekday == 2:  # Mercredi
        if t_rec_epicerie:
            TASKS.append({"templateId": t_rec_epicerie, "zoneId": z_reception, "assigneeId": OPERATOR_ID, "scheduledAt": sched(day, 9)})

# ── Hebdomadaire : nettoyage approfondi (lundi matin) ──
t_nettoyage_h = tmpl("hebdomadaire approfondi")
if t_nettoyage_h:
    for week in range(4):
        day = week * 7  # Chaque lundi
        TASKS.append({"templateId": t_nettoyage_h, "zoneId": z_cuisine, "assigneeId": MANAGER_ID, "scheduledAt": sched(day, 6)})

# ── Mensuel : maintenance équipements froid (1er de chaque mois) ──
t_maint = tmpl("Maintenance préventive équipements froid")
if t_maint and z_froid:
    TASKS.append({"templateId": t_maint, "zoneId": z_froid, "assigneeId": MANAGER_ID, "scheduledAt": sched(0, 9)})
    TASKS.append({"templateId": t_maint, "zoneId": z_froid, "assigneeId": MANAGER_ID, "scheduledAt": sched(30, 9)})

# Filtrer les tâches sans templateId ou zoneId valides
TASKS = [t for t in TASKS if t.get("templateId") and t.get("zoneId") and t["templateId"] != "" and t["zoneId"] != ""]

print(f"  → {len(TASKS)} tâches à créer...")
created_tasks = 0
failed_tasks  = 0
for i, task in enumerate(TASKS):
    r = post("/api/v1/controls/tasks", task, TOKEN)
    if r.get("data", {}).get("id"):
        created_tasks += 1
    else:
        failed_tasks += 1
    if (i + 1) % 50 == 0:
        print(f"  ... {i+1}/{len(TASKS)} tâches créées")
    time.sleep(0.05)

print(f"  ✓ {created_tasks} tâches créées, {failed_tasks} échecs")

# ─── Résumé final ─────────────────────────────────────────────────────────────

print("\n" + "="*60)
print("  ✅ RÉFÉRENTIEL HACCP PEUPLÉ AVEC SUCCÈS")
print("="*60)
print(f"  🏭 Zones créées       : {len(ZONE_IDS)}")
print(f"  🔧 Équipements        : {len(EQUIPMENTS)}")
print(f"  🥩 Produits           : {len(PRODUCTS)}")
print(f"  📋 Templates contrôle : {len(TEMPLATES)}")
print(f"  📅 Tâches PMS         : {created_tasks}")
print("")
print("  🌐 Application : http://localhost:3001")
print("  📧 admin@demo.com / Password1!")
print("="*60 + "\n")
