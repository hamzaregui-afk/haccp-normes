-- Lot 3 — PrintNode provider foundation (ADDITIVE, non-breaking).
-- Adds an explicit dispatch provider + PrintNode printer id on printers, and a
-- per-tenant print_provider_configs table holding the ENCRYPTED PrintNode API
-- key. Existing rows, the DLC flow and all current printing behaviour are
-- untouched (every new column is nullable / defaulted).

-- AlterTable
ALTER TABLE "printers" ADD COLUMN "provider" TEXT;
ALTER TABLE "printers" ADD COLUMN "printnode_printer_id" INTEGER;

-- CreateTable
CREATE TABLE "print_provider_configs" (
    "id"                    TEXT NOT NULL,
    "tenant_id"             TEXT NOT NULL,
    "printnode_api_key_enc" TEXT,
    "printnode_enabled"     BOOLEAN NOT NULL DEFAULT false,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "print_provider_configs_tenant_id_key" ON "print_provider_configs"("tenant_id");
