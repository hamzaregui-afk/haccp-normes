-- CreateTable
CREATE TABLE "dlc_labels" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "produced_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "printed_by" TEXT NOT NULL,
    "printed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dlc_labels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dlc_labels_tenant_id_idx" ON "dlc_labels"("tenant_id");

-- CreateIndex
CREATE INDEX "dlc_labels_expires_at_idx" ON "dlc_labels"("expires_at");
