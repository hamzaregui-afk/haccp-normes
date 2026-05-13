#!/bin/bash
# run_seed.sh — Seed idempotent NORMES HACCP
# Safe à relancer à tout moment. Ne supprime jamais de données.
#
# Usage : bash /opt/haccp/scripts/run_seed.sh

set -e
PSQL="docker exec -i haccp-postgres psql -U haccp_prod"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   NORMES HACCP — Seed production         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Tenant ──────────────────────────────────────────────────────────────────
echo "▶ Tenant..."
$PSQL -d haccp_tenants << 'SQL'
INSERT INTO tenants (id, name, slug, status, plan, created_at, updated_at)
VALUES ('tenant-main-001', 'NORMES HACCP', 'haccp-main', 'ACTIVE', 'standard', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status;
SQL

# ── 2. Utilisateurs ────────────────────────────────────────────────────────────
echo "▶ Utilisateurs..."
$PSQL -d haccp_auth << 'SQL'
INSERT INTO users (id, email, name, password_hash, role, status, tenant_id, created_at, updated_at)
VALUES
  ('user-admin-001',    'admin@haccp.local',     'Super Admin',     '$2b$10$YiWTcWEAspn2ebRIivnGreC1PdPsmsPn4NlfnqLD7ILiCVM5YLhD6', 'SUPER_ADMIN', 'ACTIVE', 'tenant-main-001', NOW(), NOW()),
  ('user-manager-001',  'manager@haccp.local',   'Manager HACCP',   '$2b$10$nKCItdSqKknQqXOgYnqyBOOjl5VvpGpxGqk4ztGemPxEPMll68UAu', 'MANAGER',     'ACTIVE', 'tenant-main-001', NOW(), NOW()),
  ('user-operator-001', 'operateur@haccp.local', 'Opérateur HACCP', '$2b$10$B.L.Sw945mBtTuFzD9LuZur5e9QcJuAiYzWWt29OcQdhOkuwV2k82', 'OPERATOR',    'ACTIVE', 'tenant-main-001', NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  name          = EXCLUDED.name,
  role          = EXCLUDED.role,
  status        = EXCLUDED.status;
SQL

# ── 3. Modèles de contrôle ─────────────────────────────────────────────────────
echo "▶ Modèles de contrôle..."
$PSQL -d haccp_controls << 'SQL'
INSERT INTO control_templates (id, name, type, frequency, checklist_json, tenant_id, created_at) VALUES
('tpl-reception-001', 'Contrôle à réception', 'RECEPTION', 'ON_RECEPTION',
 '[{"id":"r1","label":"Température produit à réception","type":"TEMPERATURE","unit":"C","min":-2,"max":4,"required":true},{"id":"r2","label":"Contrôle DLC / DDM","type":"DATE","required":true},{"id":"r3","label":"Etat emballage","type":"BOOLEAN","required":true},{"id":"r4","label":"Conformité étiquetage","type":"BOOLEAN","required":true},{"id":"r5","label":"Aspect visuel et olfactif","type":"BOOLEAN","required":true},{"id":"r6","label":"Vérification bon de livraison","type":"BOOLEAN","required":true},{"id":"r7","label":"Propreté véhicule","type":"BOOLEAN","required":false},{"id":"r8","label":"Enregistrement registre","type":"BOOLEAN","required":true}]'::jsonb,
 'tenant-main-001', NOW()),
('tpl-temp-stock-001', 'Contrôle température stockage', 'TEMPERATURE_STOCK', 'DAILY',
 '[{"id":"t1","label":"Température chambre froide positive","type":"TEMPERATURE","unit":"C","min":0,"max":4,"required":true},{"id":"t2","label":"Température chambre froide négative","type":"TEMPERATURE","unit":"C","min":-25,"max":-18,"required":true},{"id":"t3","label":"Température vitrine réfrigérée","type":"TEMPERATURE","unit":"C","min":0,"max":4,"required":true},{"id":"t4","label":"Fonctionnement alarmes","type":"BOOLEAN","required":false},{"id":"t5","label":"Enregistrement relevés","type":"BOOLEAN","required":true}]'::jsonb,
 'tenant-main-001', NOW()),
('tpl-temp-display-001', 'Contrôle vitrine réfrigérée', 'TEMPERATURE_DISPLAY', 'DAILY',
 '[{"id":"d1","label":"Vitrine froide salée","type":"TEMPERATURE","unit":"C","min":0,"max":4,"required":true},{"id":"d2","label":"Vitrine froide sucrée","type":"TEMPERATURE","unit":"C","min":0,"max":4,"required":true},{"id":"d3","label":"Vitrine chaude","type":"TEMPERATURE","unit":"C","min":63,"max":85,"required":false},{"id":"d4","label":"Propreté vitrine","type":"BOOLEAN","required":true},{"id":"d5","label":"DLC produits respectées","type":"BOOLEAN","required":true}]'::jsonb,
 'tenant-main-001', NOW()),
('tpl-temp-oil-001', 'Contrôle huile friteuse', 'TEMPERATURE_OIL', 'DAILY',
 '[{"id":"o1","label":"Friteuse 1 - Température","type":"TEMPERATURE","unit":"C","min":160,"max":180,"required":true},{"id":"o2","label":"Friteuse 1 - État huile","type":"SELECT","options":["Bonne","Dégradée - à changer","Changée"],"required":true},{"id":"o3","label":"Photo état huile","type":"PHOTO","required":false}]'::jsonb,
 'tenant-main-001', NOW()),
('tpl-sanitary-001', 'Contrôle sanitaire', 'SANITARY', 'DAILY',
 '[{"id":"s1","label":"Propreté surfaces de travail","type":"BOOLEAN","required":true},{"id":"s2","label":"Propreté équipements","type":"BOOLEAN","required":true},{"id":"s3","label":"Propreté sols","type":"BOOLEAN","required":true},{"id":"s4","label":"Etat EPI","type":"BOOLEAN","required":true},{"id":"s5","label":"Hygiène personnel","type":"BOOLEAN","required":true},{"id":"s6","label":"Produits entretien disponibles","type":"BOOLEAN","required":true},{"id":"s7","label":"Absence de nuisibles","type":"BOOLEAN","required":false},{"id":"s8","label":"Gestion déchets","type":"BOOLEAN","required":true}]'::jsonb,
 'tenant-main-001', NOW()),
('tpl-equipment-001', 'Contrôle équipement', 'EQUIPMENT', 'WEEKLY',
 '[{"id":"e1","label":"Équipement en bon état","type":"BOOLEAN","required":true},{"id":"e2","label":"Nettoyage effectué","type":"BOOLEAN","required":true},{"id":"e3","label":"Absence de corps étrangers","type":"BOOLEAN","required":true},{"id":"e4","label":"Maintenance à jour","type":"BOOLEAN","required":false},{"id":"e5","label":"Observations","type":"TEXT","required":false}]'::jsonb,
 'tenant-main-001', NOW()),
('tpl-production-001', 'Fiche production quotidienne', 'DAILY_PRODUCTION', 'DAILY',
 '[{"id":"p1","label":"Produit fabriqué","type":"TEXT","required":true},{"id":"p2","label":"Quantité produite","type":"NUMBER","unit":"kg","min":0,"required":true},{"id":"p3","label":"Date fabrication","type":"DATE","required":true},{"id":"p4","label":"DLC / DLUO","type":"DATE","required":true},{"id":"p5","label":"Température cuisson","type":"TEMPERATURE","unit":"C","min":63,"required":false},{"id":"p6","label":"Photo traçabilité","type":"PHOTO","required":true},{"id":"p7","label":"Signature responsable","type":"SIGNATURE","required":true}]'::jsonb,
 'tenant-main-001', NOW())
ON CONFLICT (id) DO UPDATE SET
  checklist_json = EXCLUDED.checklist_json,
  name           = EXCLUDED.name,
  frequency      = EXCLUDED.frequency;
SQL

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║              ✅ Seed terminé             ║"
echo "╠══════════════════════════════════════════╣"
echo "║  IDENTIFIANTS DE CONNEXION               ║"
echo "║                                          ║"
echo "║  SUPER ADMIN                             ║"
echo "║  Email    : admin@haccp.local            ║"
echo "║  Password : Admin2024!                   ║"
echo "║                                          ║"
echo "║  MANAGER                                 ║"
echo "║  Email    : manager@haccp.local          ║"
echo "║  Password : Manager2024!                 ║"
echo "║                                          ║"
echo "║  OPÉRATEUR                               ║"
echo "║  Email    : operateur@haccp.local        ║"
echo "║  Password : Operateur2024!               ║"
echo "╚══════════════════════════════════════════╝"
echo ""
