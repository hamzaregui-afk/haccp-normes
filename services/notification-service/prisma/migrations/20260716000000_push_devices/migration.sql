-- CreateTable
CREATE TABLE "push_devices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "expo_push_token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_expo_push_token_key" ON "push_devices"("expo_push_token");

-- CreateIndex
CREATE INDEX "push_devices_tenant_id_idx" ON "push_devices"("tenant_id");

-- CreateIndex
CREATE INDEX "push_devices_user_id_idx" ON "push_devices"("user_id");

-- CreateIndex
CREATE INDEX "push_devices_tenant_id_role_idx" ON "push_devices"("tenant_id", "role");
