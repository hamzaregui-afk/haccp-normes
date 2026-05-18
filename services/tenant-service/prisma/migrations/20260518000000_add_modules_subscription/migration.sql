-- Migration: add_modules_subscription
-- Adds TenantModule, TenantSubscription tables and optional contact/admin fields to Tenant.
-- Safe to run on existing data — no columns dropped, no required columns added without defaults.

-- CreateEnum: TenantModuleKey
DO $$ BEGIN
  CREATE TYPE "TenantModuleKey" AS ENUM (
    'DASHBOARD', 'HACCP_CONTROLS', 'NONCONFORMITIES', 'DLC', 'REPORTS',
    'EQUIPMENTS', 'PRODUCTS', 'SUPPLIERS', 'GED', 'NOTIFICATIONS', 'AUDIT',
    'PLANNING', 'TEMPERATURES', 'RECEPTIONS', 'HYGIENE', 'ANALYTICS', 'MOBILE_ACCESS'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: SubscriptionStatus
DO $$ BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM (
    'TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable: Tenant — add optional contact and admin fields
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "email"             TEXT,
  ADD COLUMN IF NOT EXISTS "phone"             TEXT,
  ADD COLUMN IF NOT EXISTS "logo"              TEXT,
  ADD COLUMN IF NOT EXISTS "primary_admin_id"  TEXT;

-- CreateTable: tenant_modules
CREATE TABLE IF NOT EXISTS "tenant_modules" (
  "id"         TEXT          NOT NULL,
  "tenant_id"  TEXT          NOT NULL,
  "module_key" "TenantModuleKey" NOT NULL,
  "enabled"    BOOLEAN       NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tenant_modules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_modules_tenant_id_module_key_key" UNIQUE ("tenant_id", "module_key"),
  CONSTRAINT "tenant_modules_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "tenant_modules_tenant_id_idx" ON "tenant_modules"("tenant_id");

-- CreateTable: tenant_subscriptions
CREATE TABLE IF NOT EXISTS "tenant_subscriptions" (
  "id"           TEXT                 NOT NULL,
  "tenant_id"    TEXT                 NOT NULL,
  "plan"         TEXT                 NOT NULL DEFAULT 'standard',
  "status"       "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
  "trial_ends_at" TIMESTAMP(3),
  "started_at"   TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at"   TIMESTAMP(3),
  "max_users"    INTEGER              NOT NULL DEFAULT 10,
  "max_sites"    INTEGER              NOT NULL DEFAULT 3,
  "notes"        TEXT,
  "created_at"   TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tenant_subscriptions_pkey"           PRIMARY KEY ("id"),
  CONSTRAINT "tenant_subscriptions_tenant_id_key"  UNIQUE ("tenant_id"),
  CONSTRAINT "tenant_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Auto-update updated_at trigger for tenant_modules
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$ BEGIN
  CREATE TRIGGER tenant_modules_updated_at
    BEFORE UPDATE ON "tenant_modules"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TRIGGER tenant_subscriptions_updated_at
    BEFORE UPDATE ON "tenant_subscriptions"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
