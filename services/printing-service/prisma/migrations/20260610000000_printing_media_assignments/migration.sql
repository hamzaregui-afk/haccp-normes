-- Phase A — 4-level printing engine foundations (ADDITIVE, non-breaking).
-- Adds MediaProfile (level 2) + PrinterAssignment (level 4) + new optional
-- columns on printers. Existing rows, the DLC flow and PrinterTemplate are
-- left untouched (legacy "connection_type" column preserved).

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('GAP', 'BLACK_MARK', 'CONTINUOUS');

-- CreateEnum
CREATE TYPE "PrinterProtocol" AS ENUM ('TSPL', 'ZPL', 'ESC_POS');

-- CreateEnum
CREATE TYPE "PrinterConnection" AS ENUM ('USB', 'BLUETOOTH', 'WIFI', 'LOCAL_AGENT');

-- CreateEnum
CREATE TYPE "PrinterStatus" AS ENUM ('UNKNOWN', 'ONLINE', 'OFFLINE', 'ERROR');

-- CreateEnum
CREATE TYPE "AssignmentScope" AS ENUM ('SITE', 'ZONE', 'USER', 'MODULE');

-- CreateTable
CREATE TABLE "media_profiles" (
    "id"             TEXT            NOT NULL,
    "tenant_id"      TEXT            NOT NULL,
    "name"           TEXT            NOT NULL,
    "width_mm"       DOUBLE PRECISION NOT NULL,
    "height_mm"      DOUBLE PRECISION NOT NULL,
    "media_type"     "MediaType"     NOT NULL DEFAULT 'GAP',
    "gap_mm"         DOUBLE PRECISION,
    "black_mark_mm"  DOUBLE PRECISION,
    "dpi"            INTEGER         NOT NULL DEFAULT 203,
    "speed"          INTEGER,
    "density"        INTEGER,
    "auto_calibrate" BOOLEAN         NOT NULL DEFAULT true,
    "is_default"     BOOLEAN         NOT NULL DEFAULT false,
    "is_active"      BOOLEAN         NOT NULL DEFAULT true,
    "created_at"     TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3)    NOT NULL,

    CONSTRAINT "media_profiles_pkey" PRIMARY KEY ("id")
);

-- AlterTable (additive columns on existing printers)
ALTER TABLE "printers"
    ADD COLUMN "brand"                    TEXT,
    ADD COLUMN "protocol"                 "PrinterProtocol"   NOT NULL DEFAULT 'ZPL',
    ADD COLUMN "connection"               "PrinterConnection",
    ADD COLUMN "default_media_profile_id" TEXT,
    ADD COLUMN "connection_status"        "PrinterStatus"     NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN "last_activity_at"         TIMESTAMP(3);

-- CreateTable
CREATE TABLE "printer_assignments" (
    "id"           TEXT              NOT NULL,
    "tenant_id"    TEXT              NOT NULL,
    "printer_id"   TEXT              NOT NULL,
    "scope"        "AssignmentScope" NOT NULL,
    "reference_id" TEXT              NOT NULL,
    "priority"     INTEGER           NOT NULL DEFAULT 0,
    "created_at"   TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3)      NOT NULL,

    CONSTRAINT "printer_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_profiles_tenant_id_idx" ON "media_profiles"("tenant_id");

-- CreateIndex
CREATE INDEX "printers_default_media_profile_id_idx" ON "printers"("default_media_profile_id");

-- CreateIndex
CREATE INDEX "printer_assignments_tenant_id_scope_reference_id_idx" ON "printer_assignments"("tenant_id", "scope", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "printer_assignments_tenant_id_scope_reference_id_printer_id_key" ON "printer_assignments"("tenant_id", "scope", "reference_id", "printer_id");

-- AddForeignKey
ALTER TABLE "printers" ADD CONSTRAINT "printers_default_media_profile_id_fkey"
    FOREIGN KEY ("default_media_profile_id") REFERENCES "media_profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printer_assignments" ADD CONSTRAINT "printer_assignments_printer_id_fkey"
    FOREIGN KEY ("printer_id") REFERENCES "printers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
