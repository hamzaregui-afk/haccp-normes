-- ─── Demo seed data (development only) ──────────────────────────────────────
-- Run via: ./infrastructure/scripts/seed.sh

-- ── Demo tenant ──────────────────────────────────────────────────────────────
INSERT INTO haccp_tenants.tenants (id, name, slug, status, plan)
VALUES ('clx_demo_tenant_01', 'Boulangerie Dupont', 'boulangerie-dupont', 'ACTIVE', 'standard')
ON CONFLICT DO NOTHING;

-- ── Demo users (passwords are bcrypt hash of "Password1!") ───────────────────
INSERT INTO haccp_auth.users (id, email, name, password_hash, role, status, tenant_id)
VALUES
  ('clx_user_admin_01', 'admin@demo.com',    'Alice Admin',    '$2b$10$demo_hash_placeholder', 'ADMIN',           'ACTIVE', 'clx_demo_tenant_01'),
  ('clx_user_mgr_01',   'manager@demo.com',  'Bob Manager',    '$2b$10$demo_hash_placeholder', 'MANAGER',         'ACTIVE', 'clx_demo_tenant_01'),
  ('clx_user_qual_01',  'quality@demo.com',  'Claire Qualité', '$2b$10$demo_hash_placeholder', 'QUALITY_OFFICER', 'ACTIVE', 'clx_demo_tenant_01'),
  ('clx_user_op_01',    'operator@demo.com', 'David Opérateur','$2b$10$demo_hash_placeholder', 'OPERATOR',        'ACTIVE', 'clx_demo_tenant_01')
ON CONFLICT DO NOTHING;

-- ── Demo site + zones ─────────────────────────────────────────────────────────
INSERT INTO haccp_tenants.sites (id, name, address, tenant_id)
VALUES ('clx_site_01', 'Atelier Principal', '12 Rue de la Boulange, Paris', 'clx_demo_tenant_01')
ON CONFLICT DO NOTHING;

INSERT INTO haccp_tenants.zones (id, name, site_id)
VALUES
  ('clx_zone_prod', 'Zone Production',  'clx_site_01'),
  ('clx_zone_cold', 'Chambre Froide',   'clx_site_01'),
  ('clx_zone_recv', 'Réception',        'clx_site_01')
ON CONFLICT DO NOTHING;
