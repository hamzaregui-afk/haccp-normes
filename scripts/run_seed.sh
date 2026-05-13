#!/bin/bash
# run_seed.sh — Seed idempotent COMPLET — toutes les bases NORMES HACCP
#
# ✅ SAFE à relancer à n'importe quel moment — ne supprime JAMAIS de données.
#    Utilise INSERT ... ON CONFLICT DO NOTHING / DO UPDATE uniquement.
#
# Usage : bash /opt/haccp/scripts/run_seed.sh
#
# Bases couvertes :
#   haccp_tenants  → tenant, sites, zones
#   haccp_auth     → utilisateurs (authentification)
#   haccp_users    → utilisateurs (user-service)
#   haccp_controls → modèles de contrôle (checklist)

set -e
PSQL="docker exec -i haccp-postgres psql -U haccp_prod"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   NORMES HACCP — Seed de référence (idempotent)     ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# 1. TENANT
# ═══════════════════════════════════════════════════════════════════════════════
echo "▶ [1/5] Tenant..."
$PSQL -d haccp_tenants << 'SQL'
INSERT INTO tenants (id, name, slug, status, plan, created_at, updated_at)
VALUES ('tenant-main-001', 'NORMES HACCP', 'haccp-main', 'ACTIVE', 'standard', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  name   = EXCLUDED.name,
  status = EXCLUDED.status;
SQL

# ═══════════════════════════════════════════════════════════════════════════════
# 2. SITES & ZONES
# ═══════════════════════════════════════════════════════════════════════════════
echo "▶ [2/5] Sites & Zones..."
$PSQL -d haccp_tenants << 'SQL'
-- Sites
INSERT INTO sites (id, name, address, tenant_id, created_at) VALUES
  ('site-main-cuisine', 'Cuisine principale',  NULL, 'tenant-main-001', NOW()),
  ('site-reception',    'Zone réception',       NULL, 'tenant-main-001', NOW()),
  ('site-magasin',      'Magasin principal',    NULL, 'tenant-main-001', NOW())
ON CONFLICT (id) DO NOTHING;

-- Zones — Cuisine principale
INSERT INTO zones (id, name, site_id, created_at) VALUES
  ('zone-cuisine-chaude',         'Cuisine chaude',         'site-main-cuisine', NOW()),
  ('zone-cuisine-froide',         'Cuisine froide',         'site-main-cuisine', NOW()),
  ('zone-plonge',                 'Plonge',                 'site-main-cuisine', NOW()),
  ('zone-stockage-sec',           'Stockage sec',           'site-main-cuisine', NOW()),
  ('zone-chambre-froide',         'Chambre froide',         'site-main-cuisine', NOW())
ON CONFLICT (id) DO NOTHING;

-- Zones — Réception
INSERT INTO zones (id, name, site_id, created_at) VALUES
  ('zone-reception-marchandises', 'Réception marchandises', 'site-reception', NOW()),
  ('zone-quai',                   'Quai de chargement',     'site-reception', NOW())
ON CONFLICT (id) DO NOTHING;

-- Zones — Magasin
INSERT INTO zones (id, name, site_id, created_at) VALUES
  ('zone-poissonnerie',           'Poissonnerie',    'site-magasin', NOW()),
  ('zone-boucherie',              'Boucherie',       'site-magasin', NOW()),
  ('zone-fromagerie',             'Fromagerie',      'site-magasin', NOW()),
  ('zone-epicerie',               'Épicerie',        'site-magasin', NOW()),
  ('zone-boulangerie',            'Boulangerie',     'site-magasin', NOW()),
  ('zone-stand-sushi',            'Stand sushi',     'site-magasin', NOW()),
  ('zone-chambre-froide-1',       'Chambre froide 1','site-magasin', NOW()),
  ('zone-chambre-froide-2',       'Chambre froide 2','site-magasin', NOW())
ON CONFLICT (id) DO NOTHING;
SQL

# ═══════════════════════════════════════════════════════════════════════════════
# 3. UTILISATEURS — haccp_auth (service d'authentification)
# ═══════════════════════════════════════════════════════════════════════════════
echo "▶ [3/5] Utilisateurs (auth)..."
$PSQL -d haccp_auth << 'SQL'
INSERT INTO users (id, email, name, password_hash, role, status, tenant_id, created_at, updated_at) VALUES
  ('user-admin-001',
   'admin@haccp.local',
   'Super Admin',
   '$2b$10$YiWTcWEAspn2ebRIivnGreC1PdPsmsPn4NlfnqLD7ILiCVM5YLhD6',
   'SUPER_ADMIN', 'ACTIVE', 'tenant-main-001', NOW(), NOW()),
  ('user-manager-001',
   'manager@haccp.local',
   'Manager HACCP',
   '$2b$10$nKCItdSqKknQqXOgYnqyBOOjl5VvpGpxGqk4ztGemPxEPMll68UAu',
   'MANAGER', 'ACTIVE', 'tenant-main-001', NOW(), NOW()),
  ('user-operator-001',
   'operateur@haccp.local',
   'Opérateur HACCP',
   '$2b$10$B.L.Sw945mBtTuFzD9LuZur5e9QcJuAiYzWWt29OcQdhOkuwV2k82',
   'OPERATOR', 'ACTIVE', 'tenant-main-001', NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  name          = EXCLUDED.name,
  role          = EXCLUDED.role,
  status        = EXCLUDED.status;
SQL

# ═══════════════════════════════════════════════════════════════════════════════
# 4. UTILISATEURS — haccp_users (user-service)
#    Même comptes que haccp_auth — sans password_hash (géré par auth-service)
# ═══════════════════════════════════════════════════════════════════════════════
echo "▶ [4/5] Utilisateurs (user-service)..."
$PSQL -d haccp_users << 'SQL'
INSERT INTO users (id, email, name, role, status, tenant_id, created_at, updated_at) VALUES
  ('user-admin-001',
   'admin@haccp.local',
   'Super Admin',
   'SUPER_ADMIN', 'ACTIVE', 'tenant-main-001', NOW(), NOW()),
  ('user-manager-001',
   'manager@haccp.local',
   'Manager HACCP',
   'MANAGER', 'ACTIVE', 'tenant-main-001', NOW(), NOW()),
  ('user-operator-001',
   'operateur@haccp.local',
   'Opérateur HACCP',
   'OPERATOR', 'ACTIVE', 'tenant-main-001', NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET
  name   = EXCLUDED.name,
  role   = EXCLUDED.role,
  status = EXCLUDED.status;
SQL

# ═══════════════════════════════════════════════════════════════════════════════
# 5. MODÈLES DE CONTRÔLE — haccp_controls
# ═══════════════════════════════════════════════════════════════════════════════
echo "▶ [5/5] Modèles de contrôle..."
$PSQL -d haccp_controls << 'SQL'
INSERT INTO control_templates (id, name, type, frequency, checklist_json, tenant_id, created_at) VALUES

('tpl-reception-001', 'Contrôle à réception', 'RECEPTION', 'ON_RECEPTION',
 '[
   {"id":"r1","label":"Température produit à réception","type":"TEMPERATURE","unit":"C","min":-2,"max":4,"required":true},
   {"id":"r2","label":"Contrôle DLC / DDM","type":"DATE","required":true},
   {"id":"r3","label":"Etat emballage — intégrité, absence de choc","type":"BOOLEAN","required":true},
   {"id":"r4","label":"Conformité étiquetage — origine, traçabilité","type":"BOOLEAN","required":true},
   {"id":"r5","label":"Aspect visuel et olfactif du produit","type":"BOOLEAN","required":true},
   {"id":"r6","label":"Vérification bon de livraison","type":"BOOLEAN","required":true},
   {"id":"r7","label":"Propreté véhicule de livraison","type":"BOOLEAN","required":false},
   {"id":"r8","label":"Enregistrement registre réception","type":"BOOLEAN","required":true}
 ]'::jsonb,
 'tenant-main-001', NOW()),

('tpl-temp-stock-001', 'Contrôle température stockage', 'TEMPERATURE_STOCK', 'DAILY',
 '[
   {"id":"t1","label":"Température chambre froide positive","type":"TEMPERATURE","unit":"C","min":0,"max":4,"required":true},
   {"id":"t2","label":"Température chambre froide négative","type":"TEMPERATURE","unit":"C","min":-25,"max":-18,"required":true},
   {"id":"t3","label":"Température vitrine réfrigérée","type":"TEMPERATURE","unit":"C","min":0,"max":4,"required":true},
   {"id":"t4","label":"Température poissonnerie","type":"TEMPERATURE","unit":"C","min":0,"max":2,"required":false},
   {"id":"t5","label":"Température boucherie","type":"TEMPERATURE","unit":"C","min":0,"max":4,"required":false},
   {"id":"t6","label":"Fonctionnement alarmes de température","type":"BOOLEAN","required":false},
   {"id":"t7","label":"Enregistrement relevés sur registre","type":"BOOLEAN","required":true}
 ]'::jsonb,
 'tenant-main-001', NOW()),

('tpl-temp-display-001', 'Contrôle vitrine réfrigérée', 'TEMPERATURE_DISPLAY', 'DAILY',
 '[
   {"id":"d1","label":"Vitrine froide salée","type":"TEMPERATURE","unit":"C","min":0,"max":4,"required":true},
   {"id":"d2","label":"Vitrine froide sucrée","type":"TEMPERATURE","unit":"C","min":0,"max":4,"required":true},
   {"id":"d3","label":"Vitrine chaude","type":"TEMPERATURE","unit":"C","min":63,"max":85,"required":false},
   {"id":"d4","label":"Propreté et état de la vitrine","type":"BOOLEAN","required":true},
   {"id":"d5","label":"DLC des produits exposés respectées","type":"BOOLEAN","required":true},
   {"id":"d6","label":"Observations","type":"TEXT","required":false}
 ]'::jsonb,
 'tenant-main-001', NOW()),

('tpl-temp-oil-001', 'Contrôle huile friteuse', 'TEMPERATURE_OIL', 'DAILY',
 '[
   {"id":"o1","label":"Friteuse 1 — Température huile","type":"TEMPERATURE","unit":"C","min":160,"max":180,"required":true},
   {"id":"o2","label":"Friteuse 2 — Température huile","type":"TEMPERATURE","unit":"C","min":160,"max":180,"required":false},
   {"id":"o3","label":"Friteuse 1 — État huile","type":"SELECT","options":["Bonne","Dégradée - à changer","Changée"],"required":true},
   {"id":"o4","label":"Friteuse 2 — État huile","type":"SELECT","options":["Bonne","Dégradée - à changer","Changée","Non utilisée"],"required":false},
   {"id":"o5","label":"Photo de l''état huile","type":"PHOTO","required":false}
 ]'::jsonb,
 'tenant-main-001', NOW()),

('tpl-sanitary-001', 'Contrôle sanitaire', 'SANITARY', 'DAILY',
 '[
   {"id":"s1","label":"Propreté surfaces de travail","type":"BOOLEAN","required":true},
   {"id":"s2","label":"Propreté équipements","type":"BOOLEAN","required":true},
   {"id":"s3","label":"Propreté sols et évacuations","type":"BOOLEAN","required":true},
   {"id":"s4","label":"Etat EPI — gants, tabliers, coiffe","type":"BOOLEAN","required":true},
   {"id":"s5","label":"Hygiène personnel — mains, tenue","type":"BOOLEAN","required":true},
   {"id":"s6","label":"Produits entretien disponibles","type":"BOOLEAN","required":true},
   {"id":"s7","label":"Absence de nuisibles","type":"BOOLEAN","required":false},
   {"id":"s8","label":"Gestion déchets","type":"BOOLEAN","required":true},
   {"id":"s9","label":"Photo état sanitaire","type":"PHOTO","required":false}
 ]'::jsonb,
 'tenant-main-001', NOW()),

('tpl-equipment-001', 'Contrôle équipement', 'EQUIPMENT', 'WEEKLY',
 '[
   {"id":"e1","label":"Équipement en bon état de fonctionnement","type":"BOOLEAN","required":true},
   {"id":"e2","label":"Nettoyage et désinfection effectués","type":"BOOLEAN","required":true},
   {"id":"e3","label":"Absence de corps étrangers","type":"BOOLEAN","required":true},
   {"id":"e4","label":"Maintenance préventive à jour","type":"BOOLEAN","required":false},
   {"id":"e5","label":"Photo de l''équipement","type":"PHOTO","required":false},
   {"id":"e6","label":"Observations / anomalies","type":"TEXT","required":false}
 ]'::jsonb,
 'tenant-main-001', NOW()),

('tpl-production-001', 'Fiche production quotidienne', 'DAILY_PRODUCTION', 'DAILY',
 '[
   {"id":"p1","label":"Produit fabriqué","type":"TEXT","required":true},
   {"id":"p2","label":"Quantité produite (kg)","type":"NUMBER","unit":"kg","min":0,"required":true},
   {"id":"p3","label":"Date et heure de fabrication","type":"DATE","required":true},
   {"id":"p4","label":"DLC / DLUO","type":"DATE","required":true},
   {"id":"p5","label":"Température de cuisson atteinte","type":"TEMPERATURE","unit":"C","min":63,"required":false},
   {"id":"p6","label":"Photo traçabilité matières premières","type":"PHOTO","required":true},
   {"id":"p7","label":"Signature responsable production","type":"SIGNATURE","required":true},
   {"id":"p8","label":"Observations","type":"TEXT","required":false}
 ]'::jsonb,
 'tenant-main-001', NOW())

ON CONFLICT (id) DO UPDATE SET
  name           = EXCLUDED.name,
  checklist_json = EXCLUDED.checklist_json,
  frequency      = EXCLUDED.frequency;
SQL

# ═══════════════════════════════════════════════════════════════════════════════
# Résumé
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              ✅  Seed terminé                       ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  IDENTIFIANTS DE CONNEXION                          ║"
echo "║                                                      ║"
echo "║  SUPER ADMIN                                         ║"
echo "║  Email    : admin@haccp.local                        ║"
echo "║  Password : Admin2024!                               ║"
echo "║                                                      ║"
echo "║  MANAGER                                             ║"
echo "║  Email    : manager@haccp.local                      ║"
echo "║  Password : Manager2024!                             ║"
echo "║                                                      ║"
echo "║  OPÉRATEUR                                           ║"
echo "║  Email    : operateur@haccp.local                    ║"
echo "║  Password : Operateur2024!                           ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
