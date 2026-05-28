-- CreateEnum
CREATE TYPE "TracabilityType" AS ENUM ('RECEPTION', 'PRODUCTION', 'EXPEDITION', 'INTERNAL', 'DESTRUCTION', 'OTHER');

-- CreateEnum
CREATE TYPE "TracabilityStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "tracabilities" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" "TracabilityType" NOT NULL DEFAULT 'RECEPTION',
    "status" "TracabilityStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "lot_number" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "supplier_id" TEXT,
    "site_id" TEXT,
    "quantity" DOUBLE PRECISION,
    "unit" VARCHAR(20),
    "reception_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3),
    "temperature" DOUBLE PRECISION,
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracability_photos" (
    "id" TEXT NOT NULL,
    "tracability_id" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" VARCHAR(500),
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracability_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tracabilities_reference_tenant_id_key" ON "tracabilities"("reference", "tenant_id");

-- CreateIndex
CREATE INDEX "tracabilities_tenant_id_idx" ON "tracabilities"("tenant_id");

-- CreateIndex
CREATE INDEX "tracabilities_tenant_id_status_idx" ON "tracabilities"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "tracabilities_tenant_id_type_idx" ON "tracabilities"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "tracabilities_created_at_idx" ON "tracabilities"("created_at");

-- AddForeignKey
ALTER TABLE "tracability_photos" ADD CONSTRAINT "tracability_photos_tracability_id_fkey" FOREIGN KEY ("tracability_id") REFERENCES "tracabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
