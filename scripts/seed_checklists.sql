-- seed_checklists.sql
-- Configure les checklists par défaut pour chaque modèle de contrôle HACCP.
--
-- Usage (depuis la racine du projet sur le serveur):
--   docker compose exec -T postgres psql -U postgres -d haccp_controls < scripts/seed_checklists.sql
--
-- Ce script ne touche QUE les modèles dont checklist_json est vide ou null.
-- Ajoutez "AND 1=0" à chaque WHERE pour tester sans modifier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- RÉCEPTION
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE control_templates
SET checklist_json = '[
  {"id":"recep01","label":"Température à réception","type":"TEMPERATURE","unit":"°C","min":-2,"max":4,"required":true},
  {"id":"recep02","label":"DLC \/ DLUO du produit","type":"DATE","required":true},
  {"id":"recep03","label":"État du conditionnement (intégrité emballage)","type":"BOOLEAN","required":true},
  {"id":"recep04","label":"Conformité de l'\''étiquetage (origine, allergènes)","type":"BOOLEAN","required":true},
  {"id":"recep05","label":"Photo du bon de livraison \/ étiquette","type":"PHOTO","required":false},
  {"id":"recep06","label":"Fournisseur \/ Nom du produit","type":"TEXT","required":false},
  {"id":"recep07","label":"Signature du réceptionnaire","type":"SIGNATURE","required":true}
]'::jsonb
WHERE type = 'RECEPTION'
  AND (checklist_json IS NULL OR checklist_json = '[]'::jsonb OR jsonb_array_length(checklist_json) = 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- TEMPÉRATURE STOCKAGE
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE control_templates
SET checklist_json = '[
  {"id":"stck01","label":"Frigo 1 — Température","type":"TEMPERATURE","unit":"°C","min":0,"max":4,"required":true},
  {"id":"stck02","label":"Frigo 2 — Température","type":"TEMPERATURE","unit":"°C","min":0,"max":4,"required":true},
  {"id":"stck03","label":"Chambre froide négative (CFN) 1 — Température","type":"TEMPERATURE","unit":"°C","min":-25,"max":-18,"required":true},
  {"id":"stck04","label":"Congélateur — Température","type":"TEMPERATURE","unit":"°C","min":-25,"max":-18,"required":false},
  {"id":"stck05","label":"État général du stockage (propreté, organisation)","type":"BOOLEAN","required":true},
  {"id":"stck06","label":"Observations","type":"TEXT","required":false}
]'::jsonb
WHERE type = 'TEMPERATURE_STOCK'
  AND (checklist_json IS NULL OR checklist_json = '[]'::jsonb OR jsonb_array_length(checklist_json) = 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- TEMPÉRATURE VITRINE / DISPLAY
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE control_templates
SET checklist_json = '[
  {"id":"disp01","label":"Vitrine froide salée — Température","type":"TEMPERATURE","unit":"°C","min":0,"max":4,"required":true},
  {"id":"disp02","label":"Vitrine froide sucrée — Température","type":"TEMPERATURE","unit":"°C","min":0,"max":4,"required":true},
  {"id":"disp03","label":"Vitrine chaude — Température","type":"TEMPERATURE","unit":"°C","min":63,"max":85,"required":false},
  {"id":"disp04","label":"Propreté et état de la vitrine","type":"BOOLEAN","required":true},
  {"id":"disp05","label":"DLC des produits exposés respectées","type":"BOOLEAN","required":true},
  {"id":"disp06","label":"Observations","type":"TEXT","required":false}
]'::jsonb
WHERE type = 'TEMPERATURE_DISPLAY'
  AND (checklist_json IS NULL OR checklist_json = '[]'::jsonb OR jsonb_array_length(checklist_json) = 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- CONTRÔLE DE L'HUILE
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE control_templates
SET checklist_json = '[
  {"id":"oil001","label":"Friteuse 1 — Température de l'\''huile","type":"TEMPERATURE","unit":"°C","min":160,"max":180,"required":true},
  {"id":"oil002","label":"Friteuse 2 — Température de l'\''huile","type":"TEMPERATURE","unit":"°C","min":160,"max":180,"required":true},
  {"id":"oil003","label":"Friteuse 3 — Température de l'\''huile","type":"TEMPERATURE","unit":"°C","min":160,"max":180,"required":false},
  {"id":"oil004","label":"Friteuse 1 — État de l'\''huile","type":"SELECT","options":["Bonne","Dégradée — à changer","Changée"],"required":true},
  {"id":"oil005","label":"Friteuse 2 — État de l'\''huile","type":"SELECT","options":["Bonne","Dégradée — à changer","Changée"],"required":true},
  {"id":"oil006","label":"Friteuse 3 — État de l'\''huile","type":"SELECT","options":["Bonne","Dégradée — à changer","Changée","Non utilisée"],"required":false},
  {"id":"oil007","label":"Photo de l'\''état de l'\''huile","type":"PHOTO","required":false}
]'::jsonb
WHERE type = 'TEMPERATURE_OIL'
  AND (checklist_json IS NULL OR checklist_json = '[]'::jsonb OR jsonb_array_length(checklist_json) = 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉQUIPEMENTS
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE control_templates
SET checklist_json = '[
  {"id":"equi01","label":"Équipement en bon état de fonctionnement","type":"BOOLEAN","required":true},
  {"id":"equi02","label":"Nettoyage \/ désinfection effectué","type":"BOOLEAN","required":true},
  {"id":"equi03","label":"Absence de corps étrangers ou contamination visible","type":"BOOLEAN","required":true},
  {"id":"equi04","label":"Maintenance préventive à jour","type":"BOOLEAN","required":false},
  {"id":"equi05","label":"Photo de l'\''équipement","type":"PHOTO","required":false},
  {"id":"equi06","label":"Observations \/ anomalies constatées","type":"TEXT","required":false}
]'::jsonb
WHERE type = 'EQUIPMENT'
  AND (checklist_json IS NULL OR checklist_json = '[]'::jsonb OR jsonb_array_length(checklist_json) = 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- CONTRÔLE SANITAIRE
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE control_templates
SET checklist_json = '[
  {"id":"san001","label":"Nettoyage des surfaces de travail effectué","type":"BOOLEAN","required":true},
  {"id":"san002","label":"Nettoyage des sols effectué","type":"BOOLEAN","required":true},
  {"id":"san003","label":"Nettoyage des équipements \/ ustensiles effectué","type":"BOOLEAN","required":true},
  {"id":"san004","label":"Désinfection des surfaces effectuée","type":"BOOLEAN","required":true},
  {"id":"san005","label":"Produits de nettoyage correctement stockés et identifiés","type":"BOOLEAN","required":true},
  {"id":"san006","label":"Présence de nuisibles ou traces","type":"SELECT","options":["Aucune trace","Traces détectées","Signalement effectué"],"required":true},
  {"id":"san007","label":"Photo de l'\''état sanitaire","type":"PHOTO","required":false},
  {"id":"san008","label":"Observations","type":"TEXT","required":false}
]'::jsonb
WHERE type = 'SANITARY'
  AND (checklist_json IS NULL OR checklist_json = '[]'::jsonb OR jsonb_array_length(checklist_json) = 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- PRODUCTION JOURNALIÈRE
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE control_templates
SET checklist_json = '[
  {"id":"prod01","label":"Produit fabriqué","type":"TEXT","required":true},
  {"id":"prod02","label":"Quantité produite","type":"NUMBER","unit":"kg","min":0,"required":true},
  {"id":"prod03","label":"Date et heure de fabrication","type":"DATE","required":true},
  {"id":"prod04","label":"DLC \/ DLUO","type":"DATE","required":true},
  {"id":"prod05","label":"Température de cuisson \/ pasteurisation atteinte","type":"TEMPERATURE","unit":"°C","min":63,"required":false},
  {"id":"prod06","label":"Traçabilité matières premières (photo étiquette ou BL)","type":"PHOTO","required":true},
  {"id":"prod07","label":"Signature du responsable de production","type":"SIGNATURE","required":true},
  {"id":"prod08","label":"Observations","type":"TEXT","required":false}
]'::jsonb
WHERE type = 'DAILY_PRODUCTION'
  AND (checklist_json IS NULL OR checklist_json = '[]'::jsonb OR jsonb_array_length(checklist_json) = 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification des modèles mis à jour
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  type,
  name,
  jsonb_array_length(checklist_json) AS nb_items
FROM control_templates
ORDER BY type, name;

COMMIT;
