#!/usr/bin/env node
/**
 * create-superadmin.js — Creates the initial SUPER_ADMIN user in production.
 *
 * Designed to run INSIDE the haccp-auth container (which has bcrypt + pg
 * available in its node_modules, and whose DATABASE_URL reaches postgres).
 *
 * Idempotent: uses ON CONFLICT (email) DO UPDATE so re-running is safe.
 *
 * Usage (from the host server):
 *   docker exec haccp-auth node /scripts/create-superadmin.js
 *
 * Environment variables (read from container env):
 *   DATABASE_URL          — already set by docker-compose (points to haccp_auth)
 *   SUPERADMIN_EMAIL      — defaults to superadmin@haccp.com
 *   SUPERADMIN_PASSWORD   — defaults to Admin@HACCP2024!
 *   SUPERADMIN_NAME       — defaults to Super Administrateur
 */

'use strict';

const path = require('path');

// ── Load bcrypt and pg from auth-service node_modules ────────────────────────
const bcrypt = require('/app/services/auth-service/node_modules/bcrypt');
const { Client } = require('/app/services/auth-service/node_modules/pg');

// ── Config ────────────────────────────────────────────────────────────────────
const ADMIN_EMAIL    = process.env.SUPERADMIN_EMAIL    || 'superadmin@haccp.com';
const ADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'Admin@HACCP2024!';
const ADMIN_NAME     = process.env.SUPERADMIN_NAME     || 'Super Administrateur';
const ADMIN_ID       = 'clx_superadmin_platform_01';
const TENANT_ID      = 'platform'; // SUPER_ADMIN is not scoped to any tenant

// ── Parse DATABASE_URL → replace database name for haccp_users ───────────────
function buildConnectionString(dbName) {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is not set');
  // Replace the last path segment (database name) in the URL
  return base.replace(/\/[^/]+$/, `/${dbName}`);
}

async function connectDB(dbName) {
  const client = new Client({ connectionString: buildConnectionString(dbName) });
  await client.connect();
  return client;
}

async function main() {
  console.log(`\n🔐 Creating SUPER_ADMIN: ${ADMIN_EMAIL}`);

  console.log('   Generating bcrypt hash (cost=10)…');
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  console.log('   Hash generated ✓');

  // ── 1. Insert into haccp_auth (credentials) ─────────────────────────────
  console.log('\n   Writing to haccp_auth…');
  const authDb = await connectDB('haccp_auth');
  try {
    await authDb.query(
      `INSERT INTO users (id, email, name, password_hash, role, status, tenant_id, updated_at)
       VALUES ($1, $2, $3, $4, $5::"UserRole", $6::"UserStatus", $7, NOW())
       ON CONFLICT (email) DO UPDATE
         SET name          = EXCLUDED.name,
             password_hash = EXCLUDED.password_hash,
             role          = EXCLUDED.role,
             status        = EXCLUDED.status,
             tenant_id     = EXCLUDED.tenant_id,
             updated_at    = NOW()`,
      [ADMIN_ID, ADMIN_EMAIL, ADMIN_NAME, passwordHash, 'SUPER_ADMIN', 'ACTIVE', TENANT_ID],
    );
    console.log('   haccp_auth ✓');
  } finally {
    await authDb.end();
  }

  // ── 2. Insert into haccp_users (profile, no password) ───────────────────
  console.log('   Writing to haccp_users…');
  const usersDb = await connectDB('haccp_users');
  try {
    await usersDb.query(
      `INSERT INTO users (id, email, name, role, status, tenant_id, updated_at)
       VALUES ($1, $2, $3, $4::"UserRole", $5::"UserStatus", $6, NOW())
       ON CONFLICT (id) DO UPDATE
         SET name      = EXCLUDED.name,
             role      = EXCLUDED.role,
             status    = EXCLUDED.status,
             tenant_id = EXCLUDED.tenant_id,
             updated_at = NOW()`,
      [ADMIN_ID, ADMIN_EMAIL, ADMIN_NAME, 'SUPER_ADMIN', 'ACTIVE', TENANT_ID],
    );
    console.log('   haccp_users ✓');
  } catch (err) {
    // Non-fatal: user-service profile is for display only; auth still works
    console.warn(`   haccp_users warning: ${err.message}`);
  } finally {
    await usersDb.end();
  }

  console.log('\n✅ SUPER_ADMIN ready!');
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log(`   Role:     SUPER_ADMIN`);
  console.log('\n⚠️  Change this password after first login!\n');
}

main().catch((err) => {
  console.error('\n❌ Failed:', err.message);
  process.exit(1);
});
