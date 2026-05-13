-- ============================================================
-- seed_production.sql — Seed idempotent de toutes les données
-- de référence pour NORMES HACCP en production.
--
-- CE SCRIPT EST SAFE À LANCER AUTANT DE FOIS QUE NÉCESSAIRE.
-- Il utilise INSERT ... ON CONFLICT DO NOTHING / DO UPDATE.
-- Il ne supprime JAMAIS de données existantes.
--
-- Usage (depuis le serveur) :
--   bash /opt/haccp/scripts/run_seed.sh
--
-- Ou manuellement :
--   docker exec -i haccp-postgres psql -U haccp_prod -d haccp_auth   < scripts/seed_production.sql
--   docker exec -i haccp-postgres psql -U haccp_prod -d haccp_tenants < scripts/seed_production.sql
--   docker exec -i haccp-postgres psql -U haccp_prod -d haccp_controls < scripts/seed_production.sql
-- ============================================================

-- ============================================================
-- 1. TENANTS (haccp_tenants)
-- ============================================================
\connect haccp_tenants

INSERT INTO tenants (id, name, status, created_at, updated_at)
VALUES ('tenant-main-001', 'NORMES HACCP', 'ACTIVE', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  name   = EXCLUDED.name,
  status = EXCLUDED.status;

-- ============================================================
-- 2. UTILISATEURS (haccp_auth)
-- Mots de passe : voir tableau ci-dessous
-- SUPER_ADMIN  : Admin2024!
-- MANAGER      : Manager2024!
-- OPERATOR     : Operateur2024!
-- ============================================================
\connect haccp_auth

-- Super Admin
INSERT INTO users (id, email, name, password_hash, role, status, tenant_id, created_at, updated_at)
VALUES (
  'user-admin-001',
  'admin@haccp.local',
  'Super Admin',
  '$2b$10$YiWTcWEAspn2ebRIivnGreC1PdPsmsPn4NlfnqLD7ILiCVM5YLhD6',
  'SUPER_ADMIN', 'ACTIVE', 'tenant-main-001', NOW(), NOW()
) ON CONFLICT (email) DO UPDATE SET
  password_hash = '$2b$10$YiWTcWEAspn2ebRIivnGreC1PdPsmsPn4NlfnqLD7ILiCVM5YLhD6',
  name = 'Super Admin', role = 'SUPER_ADMIN', status = 'ACTIVE';

-- Manager
INSERT INTO users (id, email, name, password_hash, role, status, tenant_id, created_at, updated_at)
VALUES (
  'user-manager-001',
  'manager@haccp.local',
  'Manager HACCP',
  '$2b$10$nKCItdSqKknQqXOgYnqyBOOjl5VvpGpxGqk4ztGemPxEPMll68UAu',
  'MANAGER', 'ACTIVE', 'tenant-main-001', NOW(), NOW()
) ON CONFLICT (email) DO UPDATE SET
  password_hash = '$2b$10$nKCItdSqKknQqXOgYnqyBOOjl5VvpGpxGqk4ztGemPxEPMll68UAu',
  name = 'Manager HACCP', role = 'MANAGER', status = 'ACTIVE';

-- Opérateur
INSERT INTO users (id, email, name, password_hash, role, status, tenant_id, created_at, updated_at)
VALUES (
  'user-operator-001',
  'operateur@haccp.local',
  'Opérateur HACCP',
  '$2b$10$B.L.Sw945mBtTuFzD9LuZur5e9QcJuAiYzWWt29OcQdhOkuwV2k82',
  'OPERATOR', 'ACTIVE', 'tenant-main-001', NOW(), NOW()
) ON CONFLICT (email) DO UPDATE SET
  password_hash = '$2b$10$B.L.Sw945mBtTuFzD9LuZur5e9QcJuAiYzWWt29OcQdhOkuwV2k82',
  name = 'Opérateur HACCP', role = 'OPERATOR', status = 'ACTIVE';

-- ============================================================
-- 3. MODÈLES DE CONTRÔLE (haccp_controls)
-- ============================================================
\connect haccp_controls

-- RÉCEPTION
INSERT INTO control_templates (id, name, type, frequency, checklist_json, tenant_id, created_at, updated_at)
VALUES (
  'tpl-reception-001',
  'Contrôle à réception',
  'RECEPTION',
  'ON_RECEPTION',
  '[
    {"id":"r1","label":"Température produit à réception","type":"TEMPERATURE","unit":"C","min":-2,"max":4,"required":true},
    {"id":"r2","label":"Contrôle DLC / DDM","type":"DATE","required":true},
    {"id":"r3","label":"Etat emballage - intégrité, absence de choc","type":"BOOLEAN","required":true},
    {"id":"r4","label":"Conformité étiquetage - origine, traçabilité","type":"BOOLEAN","required":true},
    {"id":"r5","label":"Aspect visuel et olfactif du produit","type":"BOOLEAN","required":true},
    {"id":"r6","label":"Vérification bon de livraison","type":"BOOLEAN","required":true},
    {"id":"r7","label":"Propreté véhicule de livraison","type":"BOOLEAN","required":false},
    {"id":"r8","label":"Enregistrement registre réception","type":"BOOLEAN","required":true}
  ]'::jsonb,
  'tenant-main-001',
  NOW(), NOW()
) ON CONFLICT (id) DO UPDATE SET
  checklist_json = EXCLUDED.checklist_json,
  name = EXCLUDED.name;

-- STOCKAGE TEMPÉRATURE
INSERT INTO control_templates (id, name, type, frequency, checklist_json, tenant_id, created_at, updated_at)
VALUES (
  'tpl-temp-stock-001',
  'Contrôle de température stockage',
  'TEMPERATURE_STOCK',
  'DAILY',
  '[
    {"id":"t1","label":"Température chambre froide positive","type":"TEMPERATURE","unit":"C","min":0,"max":4,"required":true},
    {"id":"t2","label":"Température chambre froide négative","type":"TEMPERATURE","unit":"C","min":-25,"max":-18,"required":true},
    {"id":"t3","label":"Température vitrine réfrigérée","type":"TEMPERATURE","unit":"C","min":0,"max":4,"required":true},
    {"id":"t4","label":"Température poissonnerie","type":"TEMPERATURE","unit":"C","min":0,"max":2,"required":false},
    {"id":"t5","label":"Température boucherie","type":"TEMPERATURE","unit":"C","min":0,"max":4,"required":false},
    {"id":"t6","label":"Fonctionnement alarmes de température","type":"BOOLEAN","required":false},
    {"id":"t7","label":"Enregistrement relevés sur registre","type":"BOOLEAN","required":true}
  ]'::jsonb,
  'tenant-main-001',
  NOW(), NOW()
) ON CONFLICT (id) DO UPDATE SET
  checklist_json = EXCLUDED.checklist_json,
  name = EXCLUDED.name;

-- VITRINE / DISPLAY
INSERT INTO control_templates (id, name, type, frequency, checklist_json, tenant_id, created_at, updated_at)
VALUES (
  'tpl-temp-display-001',
  'Contrôle vitrine réfrigérée',
  'TEMPERATURE_DISPLAY',
  'DAILY',
  '[
    {"id":"d1","label":"Vitrine froide salée","type":"TEMPERATURE","unit":"C","min":0,"max":4,"required":true},
    {"id":"d2","label":"Vitrine froide sucrée","type":"TEMPERATURE","unit":"C","min":0,"max":4,"required":true},
    {"id":"d3","label":"Vitrine chaude","type":"TEMPERATURE","unit":"C","min":63,"max":85,"required":false},
    {"id":"d4","label":"Propreté et état de la vitrine","type":"BOOLEAN","required":true},
    {"id":"d5","label":"DLC des produits exposés respectées","type":"BOOLEAN","required":true},
    {"id":"d6","label":"Observations","type":"TEXT","required":false}
  ]'::jsonb,
  'tenant-main-001',
  NOW(), NOW()
) ON CONFLICT (id) DO UPDATE SET
  checklist_json = EXCLUDED.checklist_json,
  name = EXCLUDED.name;

-- HUILE FRITEUSE
INSERT INTO control_templates (id, name, type, frequency, checklist_json, tenant_id, created_at, updated_at)
VALUES (
  'tpl-temp-oil-001',
  'Contrôle huile friteuse',
  'TEMPERATURE_OIL',
  'DAILY',
  '[
    {"id":"o1","label":"Friteuse 1 - Température huile","type":"TEMPERATURE","unit":"C","min":160,"max":180,"required":true},
    {"id":"o2","label":"Friteuse 2 - Température huile","type":"TEMPERATURE","unit":"C","min":160,"max":180,"required":false},
    {"id":"o3","label":"Friteuse 1 - État huile","type":"SELECT","options":["Bonne","Dégradée - à changer","Changée"],"required":true},
    {"id":"o4","label":"Friteuse 2 - État huile","type":"SELECT","options":["Bonne","Dégradée - à changer","Changée","Non utilisée"],"required":false},
    {"id":"o5","label":"Photo de l''état huile","type":"PHOTO","required":false}
  ]'::jsonb,
  'tenant-main-001',
  NOW(), NOW()
) ON CONFLICT (id) DO UPDATE SET
  checklist_json = EXCLUDED.checklist_json,
  name = EXCLUDED.name;

-- SANITAIRE
INSERT INTO control_templates (id, name, type, frequency, checklist_json, tenant_id, created_at, updated_at)
VALUES (
  'tpl-sanitary-001',
  'Contrôle sanitaire',
  'SANITARY',
  'DAILY',
  '[
    {"id":"s1","label":"Propreté surfaces de travail","type":"BOOLEAN","required":true},
    {"id":"s2","label":"Propreté équipements","type":"BOOLEAN","required":true},
    {"id":"s3","label":"Propreté sols et évacuations","type":"BOOLEAN","required":true},
    {"id":"s4","label":"Etat EPI - gants, tabliers, coiffe","type":"BOOLEAN","required":true},
    {"id":"s5","label":"Hygiène personnel - mains, tenue","type":"BOOLEAN","required":true},
    {"id":"s6","label":"Produits entretien disponibles","type":"BOOLEAN","required":true},
    {"id":"s7","label":"Absence de nuisibles","type":"BOOLEAN","required":false},
    {"id":"s8","label":"Gestion déchets","type":"BOOLEAN","required":true},
    {"id":"s9","label":"Photo état sanitaire","type":"PHOTO","required":false}
  ]'::jsonb,
  'tenant-main-001',
  NOW(), NOW()
) ON CONFLICT (id) DO UPDATE SET
  checklist_json = EXCLUDED.checklist_json,
  name = EXCLUDED.name;

-- ÉQUIPEMENT
INSERT INTO control_templates (id, name, type, frequency, checklist_json, tenant_id, created_at, updated_at)
VALUES (
  'tpl-equipment-001',
  'Contrôle équipement',
  'EQUIPMENT',
  'WEEKLY',
  '[
    {"id":"e1","label":"Équipement en bon état de fonctionnement","type":"BOOLEAN","required":true},
    {"id":"e2","label":"Nettoyage et désinfection effectués","type":"BOOLEAN","required":true},
    {"id":"e3","label":"Absence de corps étrangers","type":"BOOLEAN","required":true},
    {"id":"e4","label":"Maintenance préventive à jour","type":"BOOLEAN","required":false},
    {"id":"e5","label":"Photo de l''équipement","type":"PHOTO","required":false},
    {"id":"e6","label":"Observations / anomalies","type":"TEXT","required":false}
  ]'::jsonb,
  'tenant-main-001',
  NOW(), NOW()
) ON CONFLICT (id) DO UPDATE SET
  checklist_json = EXCLUDED.checklist_json,
  name = EXCLUDED.name;

-- PRODUCTION QUOTIDIENNE
INSERT INTO control_templates (id, name, type, frequency, checklist_json, tenant_id, created_at, updated_at)
VALUES (
  'tpl-production-001',
  'Fiche production quotidienne',
  'DAILY_PRODUCTION',
  'DAILY',
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
  'tenant-main-001',
  NOW(), NOW()
) ON CONFLICT (id) DO UPDATE SET
  checklist_json = EXCLUDED.checklist_json,
  name = EXCLUDED.name;

-- Vérification finale
SELECT type, name, jsonb_array_length(checklist_json) AS nb_items
FROM control_templates
ORDER BY type;
