-- AlterTable: add business / settings fields to tenants
-- These fields are used by the SettingsPage and the PATCH /tenants/me endpoint.
-- All columns are nullable or have safe defaults to avoid breaking existing rows.

ALTER TABLE "tenants"
  ADD COLUMN "siret"                     TEXT,
  ADD COLUMN "address"                   TEXT,
  ADD COLUMN "sector"                    TEXT,
  ADD COLUMN "notify_new_nc"             BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notify_validated_reports"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notify_critical_dlc"       BOOLEAN NOT NULL DEFAULT false;
