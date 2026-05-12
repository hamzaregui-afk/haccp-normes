-- HACCP Demo Seed
-- Run with: psql -U postgres -h localhost -f seed.sql

-- 1. haccp_tenants
\connect haccp_tenants
INSERT INTO tenants (id, name, slug, status, plan, updated_at)
VALUES ('clx_demo_tenant_01', 'Boulangerie Dupont', 'boulangerie-dupont', 'ACTIVE', 'standard', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO sites (id, name, address, tenant_id, created_at)
VALUES ('clx_site_01', 'Atelier Principal', '12 Rue de la Boulange, Paris', 'clx_demo_tenant_01', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO zones (id, name, site_id, created_at)
VALUES
  ('clx_zone_prod', 'Zone Production', 'clx_site_01', NOW()),
  ('clx_zone_cold', 'Chambre Froide',  'clx_site_01', NOW()),
  ('clx_zone_recv', 'Réception',       'clx_site_01', NOW())
ON CONFLICT (id) DO NOTHING;

-- 2. haccp_auth (credentials with bcrypt hash of Password1!)
\connect haccp_auth
INSERT INTO users (id, email, name, password_hash, role, status, tenant_id, updated_at)
VALUES
  ('clx_user_admin_01', 'admin@demo.com',    'Alice Admin',     '$2b$10$GknPkoMLp//5ZW2jxaXFlOlJ8a4cbK.eywy4Hq86EPodJi.42hPEu', 'ADMIN'::"UserRole",           'ACTIVE'::"UserStatus", 'clx_demo_tenant_01', NOW()),
  ('clx_user_mgr_01',   'manager@demo.com',  'Bob Manager',     '$2b$10$GknPkoMLp//5ZW2jxaXFlOlJ8a4cbK.eywy4Hq86EPodJi.42hPEu', 'MANAGER'::"UserRole",         'ACTIVE'::"UserStatus", 'clx_demo_tenant_01', NOW()),
  ('clx_user_qual_01',  'quality@demo.com',  'Claire Qualité',  '$2b$10$GknPkoMLp//5ZW2jxaXFlOlJ8a4cbK.eywy4Hq86EPodJi.42hPEu', 'QUALITY_OFFICER'::"UserRole", 'ACTIVE'::"UserStatus", 'clx_demo_tenant_01', NOW()),
  ('clx_user_op_01',    'operator@demo.com', 'David Opérateur', '$2b$10$GknPkoMLp//5ZW2jxaXFlOlJ8a4cbK.eywy4Hq86EPodJi.42hPEu', 'OPERATOR'::"UserRole",        'ACTIVE'::"UserStatus", 'clx_demo_tenant_01', NOW())
ON CONFLICT (id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      updated_at    = NOW();

-- 3. haccp_users (profiles, no password)
\connect haccp_users
INSERT INTO users (id, email, name, role, status, tenant_id, updated_at)
VALUES
  ('clx_user_admin_01', 'admin@demo.com',    'Alice Admin',     'ADMIN'::"UserRole",           'ACTIVE'::"UserStatus", 'clx_demo_tenant_01', NOW()),
  ('clx_user_mgr_01',   'manager@demo.com',  'Bob Manager',     'MANAGER'::"UserRole",         'ACTIVE'::"UserStatus", 'clx_demo_tenant_01', NOW()),
  ('clx_user_qual_01',  'quality@demo.com',  'Claire Qualité',  'QUALITY_OFFICER'::"UserRole", 'ACTIVE'::"UserStatus", 'clx_demo_tenant_01', NOW()),
  ('clx_user_op_01',    'operator@demo.com', 'David Opérateur', 'OPERATOR'::"UserRole",        'ACTIVE'::"UserStatus", 'clx_demo_tenant_01', NOW())
ON CONFLICT (id) DO NOTHING;

\echo 'Seed complete!'
