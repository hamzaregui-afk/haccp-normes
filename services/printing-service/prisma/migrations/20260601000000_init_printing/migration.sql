-- CreateEnum
CREATE TYPE "ConnectionType" AS ENUM ('NETWORK', 'BLUETOOTH', 'USB');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "printers" (
    "id"                   TEXT         NOT NULL,
    "tenant_id"            TEXT         NOT NULL,
    "name"                 TEXT         NOT NULL,
    "model"                TEXT,
    "connection_type"      "ConnectionType" NOT NULL DEFAULT 'NETWORK',
    "ip_address"           TEXT,
    "port"                 INTEGER      NOT NULL DEFAULT 9100,
    "bluetooth_identifier" TEXT,
    "is_default"           BOOLEAN      NOT NULL DEFAULT false,
    "is_active"            BOOLEAN      NOT NULL DEFAULT true,
    "site_id"              TEXT,
    "zone_id"              TEXT,
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printer_templates" (
    "id"           TEXT         NOT NULL,
    "tenant_id"    TEXT         NOT NULL,
    "name"         TEXT         NOT NULL,
    "label_type"   TEXT         NOT NULL,
    "width_mm"     INTEGER      NOT NULL DEFAULT 100,
    "height_mm"    INTEGER      NOT NULL DEFAULT 50,
    "zpl_template" TEXT         NOT NULL,
    "is_default"   BOOLEAN      NOT NULL DEFAULT false,
    "is_active"    BOOLEAN      NOT NULL DEFAULT true,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printer_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_jobs" (
    "id"            TEXT            NOT NULL,
    "tenant_id"     TEXT            NOT NULL,
    "user_id"       TEXT            NOT NULL,
    "printer_id"    TEXT,
    "template_id"   TEXT,
    "label_type"    TEXT            NOT NULL,
    "payload"       JSONB           NOT NULL,
    "zpl"           TEXT,
    "status"        "PrintJobStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "copies"        INTEGER         NOT NULL DEFAULT 1,
    "created_at"    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printed_at"    TIMESTAMP(3),

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "printers_tenant_id_idx" ON "printers"("tenant_id");

-- CreateIndex
CREATE INDEX "printer_templates_tenant_id_label_type_idx" ON "printer_templates"("tenant_id", "label_type");

-- CreateIndex
CREATE INDEX "print_jobs_tenant_id_idx" ON "print_jobs"("tenant_id");

-- CreateIndex
CREATE INDEX "print_jobs_tenant_id_status_idx" ON "print_jobs"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_printer_id_fkey"
    FOREIGN KEY ("printer_id") REFERENCES "printers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
