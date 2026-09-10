-- Lot 3b — printer provider config + media layout (ADDITIVE, non-breaking).
-- Lets the UI persist a selected PrintNode computer/printer and richer label
-- layout. Every column is nullable / defaulted; existing rows stay valid.

-- AlterTable: printers
ALTER TABLE "printers" ADD COLUMN "provider_computer_id" INTEGER;
ALTER TABLE "printers" ADD COLUMN "provider_config" JSONB;

-- AlterTable: media_profiles
ALTER TABLE "media_profiles" ADD COLUMN "orientation"      TEXT;
ALTER TABLE "media_profiles" ADD COLUMN "margin_top_mm"    DOUBLE PRECISION;
ALTER TABLE "media_profiles" ADD COLUMN "margin_bottom_mm" DOUBLE PRECISION;
ALTER TABLE "media_profiles" ADD COLUMN "margin_left_mm"   DOUBLE PRECISION;
ALTER TABLE "media_profiles" ADD COLUMN "margin_right_mm"  DOUBLE PRECISION;
ALTER TABLE "media_profiles" ADD COLUMN "cutter"           BOOLEAN NOT NULL DEFAULT false;
