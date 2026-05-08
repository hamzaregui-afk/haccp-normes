-- CreateEnum
CREATE TYPE "NCStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NCSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NCCategory" AS ENUM ('TEMPERATURE', 'HYGIENE', 'LABELING', 'TRACEABILITY', 'EQUIPMENT', 'SUPPLIER', 'PROCESS', 'OTHER');

-- CreateTable
CREATE TABLE "non_conformities" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "product_id" TEXT,
    "reporter_id" TEXT NOT NULL,
    "closed_by_id" TEXT,
    "status" "NCStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "NCSeverity" NOT NULL DEFAULT 'MEDIUM',
    "category" "NCCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL,
    "corrective_action" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "non_conformities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nc_photos" (
    "id" TEXT NOT NULL,
    "non_conformity_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nc_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "non_conformities_reference_key" ON "non_conformities"("reference");

-- CreateIndex
CREATE INDEX "non_conformities_tenant_id_idx" ON "non_conformities"("tenant_id");

-- CreateIndex
CREATE INDEX "non_conformities_status_idx" ON "non_conformities"("status");

-- CreateIndex
CREATE INDEX "non_conformities_created_at_idx" ON "non_conformities"("created_at");

-- AddForeignKey
ALTER TABLE "nc_photos" ADD CONSTRAINT "nc_photos_non_conformity_id_fkey" FOREIGN KEY ("non_conformity_id") REFERENCES "non_conformities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
