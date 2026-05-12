#!/usr/bin/env node
/**
 * seed.js — Demo data seeder (development only).
 *
 * Connects to each PostgreSQL database separately (PostgreSQL cannot query
 * across databases via schema.table notation — cross-DB joins don't exist).
 *
 * Databases written:
 *   1. haccp_tenants — tenants, sites, zones
 *   2. haccp_auth    — user credentials with a REAL bcrypt hash
 *   3. haccp_users   — user profiles (no password)
 *
 * Run via:  ./infrastructure/scripts/seed.sh
 * Or:       node infrastructure/scripts/seed.js
 */

'use strict';

if (process.env.NODE_ENV === 'production') {
  console.error('❌  Seed must not run in production');
  process.exit(1);
}

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

// ARCH-DECISION: Use bcrypt from auth-service's node_modules to guarantee
// we use the same version/implementation that auth-service uses at runtime.
// Fallback to the root-level bcrypt if the service module isn't installed yet.
let bcrypt;
try {
  bcrypt = require(path.join(ROOT, 'services', 'auth-service', 'node_modules', 'bcrypt'));
} catch {
  try {
    bcrypt = require('bcrypt');
  } catch {
    console.error(
      '❌  bcrypt not found. Run `pnpm install` from the monorepo root first.',
    );
    process.exit(1);
  }
}

// Similarly resolve the pg Client
let pg;
try {
  pg = require(path.join(ROOT, 'services', 'auth-service', 'node_modules', 'pg'));
} catch {
  try {
    pg = require('pg');
  } catch {
    console.error(
      '❌  pg not found. Run `pnpm install` from the monorepo root first.',
    );
    process.exit(1);
  }
}
const { Client } = pg;

// ── Connection config (matches docker-compose env) ───────────────────────────
const PG = {
  host:     process.env.POSTGRES_HOST     || 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT || '5432', 10),
  user:     process.env.POSTGRES_USER     || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
};

// ── Fixed CUID-style IDs (must stay stable across re-runs) ───────────────────
const IDS = {
  tenant:  'clx_demo_tenant_01',
  site:    'clx_site_01',
  zones: {
    prod: 'clx_zone_prod',
    cold: 'clx_zone_cold',
    recv: 'clx_zone_recv',
  },
  users: {
    admin:    'clx_user_admin_01',
    manager:  'clx_user_mgr_01',
    quality:  'clx_user_qual_01',
    operator: 'clx_user_op_01',
  },
};

async function connect(database) {
  const client = new Client({ ...PG, database });
  await client.connect();
  return client;
}

// ── 1. haccp_tenants ─────────────────────────────────────────────────────────
async function seedTenants() {
  const db = await connect('haccp_tenants');
  try {
    console.log('  → tenants…');
    await db.query(
      `INSERT INTO tenants (id, name, slug, status, plan, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [IDS.tenant, 'Boulangerie Dupont', 'boulangerie-dupont', 'ACTIVE', 'standard'],
    );

    console.log('  → sites…');
    await db.query(
      `INSERT INTO sites (id, name, address, tenant_id, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [IDS.site, 'Atelier Principal', '12 Rue de la Boulange, Paris', IDS.tenant],
    );

    console.log('  → zones…');
    await db.query(
      `INSERT INTO zones (id, name, site_id, created_at)
       VALUES ($1, $2, $3, NOW()), ($4, $5, $6, NOW()), ($7, $8, $9, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        IDS.zones.prod, 'Zone Production', IDS.site,
        IDS.zones.cold, 'Chambre Froide',  IDS.site,
        IDS.zones.recv, 'Réception',       IDS.site,
      ],
    );
  } finally {
    await db.end();
  }
}

// ── 2. haccp_auth (credentials) ──────────────────────────────────────────────
async function seedAuth(passwordHash) {
  const db = await connect('haccp_auth');
  try {
    console.log('  → auth users (with bcrypt hash)…');

    const users = [
      [IDS.users.admin,    'admin@demo.com',    'Alice Admin',     'ADMIN',           'ACTIVE', IDS.tenant],
      [IDS.users.manager,  'manager@demo.com',  'Bob Manager',     'MANAGER',         'ACTIVE', IDS.tenant],
      [IDS.users.quality,  'quality@demo.com',  'Claire Qualité',  'QUALITY_OFFICER', 'ACTIVE', IDS.tenant],
      [IDS.users.operator, 'operator@demo.com', 'David Opérateur', 'OPERATOR',        'ACTIVE', IDS.tenant],
    ];

    for (const [id, email, name, role, status, tenantId] of users) {
      await db.query(
        `INSERT INTO users (id, email, name, password_hash, role, status, tenant_id, updated_at)
         VALUES ($1, $2, $3, $4, $5::\"UserRole\", $6::\"UserStatus\", $7, NOW())
         ON CONFLICT (id) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               updated_at    = NOW()`,
        [id, email, name, passwordHash, role, status, tenantId],
      );
    }
  } finally {
    await db.end();
  }
}

// ── 3. haccp_users (profiles, no password) ───────────────────────────────────
async function seedUsers() {
  const db = await connect('haccp_users');
  try {
    console.log('  → user profiles…');

    const users = [
      [IDS.users.admin,    'admin@demo.com',    'Alice Admin',     'ADMIN',           'ACTIVE', IDS.tenant],
      [IDS.users.manager,  'manager@demo.com',  'Bob Manager',     'MANAGER',         'ACTIVE', IDS.tenant],
      [IDS.users.quality,  'quality@demo.com',  'Claire Qualité',  'QUALITY_OFFICER', 'ACTIVE', IDS.tenant],
      [IDS.users.operator, 'operator@demo.com', 'David Opérateur', 'OPERATOR',        'ACTIVE', IDS.tenant],
    ];

    for (const [id, email, name, role, status, tenantId] of users) {
      await db.query(
        `INSERT INTO users (id, email, name, role, status, tenant_id, updated_at)
         VALUES ($1, $2, $3, $4::\"UserRole\", $5::\"UserStatus\", $6, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [id, email, name, role, status, tenantId],
      );
    }
  } finally {
    await db.end();
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔐 Generating bcrypt hash for "Password1!" (cost=10)…');
  const passwordHash = await bcrypt.hash('Password1!', 10);
  console.log('   Hash generated ✓');

  console.log('\n📦 Seeding haccp_tenants…');
  await seedTenants();

  console.log('\n🔑 Seeding haccp_auth…');
  await seedAuth(passwordHash);

  console.log('\n👤 Seeding haccp_users…');
  await seedUsers();

  console.log('\n✅  Seed complete!');
  console.log('\nDemo accounts (password: Password1!):');
  console.log('  admin@demo.com    — ADMIN');
  console.log('  manager@demo.com  — MANAGER');
  console.log('  quality@demo.com  — QUALITY_OFFICER');
  console.log('  operator@demo.com — OPERATOR');
}

main().catch((err) => {
  console.error('\n❌  Seed failed:', err.message);
  process.exit(1);
});
