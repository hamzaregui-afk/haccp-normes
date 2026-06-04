-- Migration: add objectKey to NCPhoto + index on nonConformityId
-- Fixes: orphaned MinIO objects (no objectKey = cannot delete from MinIO)
-- Fixes: missing index causes full table scan on photo queries

-- Add objectKey column (nullable initially for existing rows, then we backfill)
ALTER TABLE "nc_photos" ADD COLUMN IF NOT EXISTS "object_key" TEXT;

-- Backfill: for existing rows, derive objectKey from url (extract path after /storage/)
-- This is best-effort; existing photos may have broken delete but won't crash
UPDATE "nc_photos"
SET "object_key" = regexp_replace(url, '.*/storage/', '')
WHERE "object_key" IS NULL AND url IS NOT NULL;

-- Set NOT NULL constraint after backfill
ALTER TABLE "nc_photos" ALTER COLUMN "object_key" SET NOT NULL;
ALTER TABLE "nc_photos" ALTER COLUMN "object_key" SET DEFAULT '';

-- Add index for fast photo retrieval by NC
CREATE INDEX IF NOT EXISTS "nc_photos_non_conformity_id_idx"
  ON "nc_photos" ("non_conformity_id");
