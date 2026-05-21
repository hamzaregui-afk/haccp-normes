-- Migration: make NC reference unique per-tenant instead of globally unique
--
-- ROOT CAUSE: The original @unique on `reference` caused P2002 failures when
-- two different tenants both created their first NC of the year.
-- generateReference() counts NCs *per tenant* (both get NC-YYYY-0001), but the
-- global unique index rejected the second insert. The fix scopes uniqueness to
-- (reference, tenant_id) to match the per-tenant counter semantics.
--
-- This migration is non-destructive:
--   - Drops the old global unique index on reference
--   - Adds a new compound unique index on (reference, tenant_id)
-- Existing data is compatible: each tenant's references are already unique
-- within that tenant (monotonically incremented counter).

-- Drop the global unique constraint on reference
DROP INDEX IF EXISTS "non_conformities_reference_key";

-- Add per-tenant uniqueness: same reference allowed across different tenants
CREATE UNIQUE INDEX "non_conformities_reference_tenant_id_key"
  ON "non_conformities"("reference", "tenant_id");
