-- ─── GED (Gestion Électronique de Documents) ─────────────────────────────────
-- Adds Document and DocumentRequest tables to the asset-service database.
-- Both are tenant-scoped and append-only (no DELETE, soft-delete via status).

-- Enums
CREATE TYPE "DocumentCategory" AS ENUM ('PROCEDURE', 'RECIPE', 'OTHER');
CREATE TYPE "DocRequestStatus"  AS ENUM ('PENDING', 'FULFILLED', 'REJECTED');

-- Documents (binary objects stored in MinIO)
CREATE TABLE "documents" (
    "id"          TEXT NOT NULL,
    "tenant_id"   TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "category"    "DocumentCategory" NOT NULL,
    "mime_type"   TEXT NOT NULL,
    "size_bytes"  INTEGER NOT NULL,
    "object_key"  TEXT NOT NULL,
    "url"         TEXT NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "documents_tenant_id_idx"  ON "documents"("tenant_id");
CREATE INDEX "documents_category_idx"   ON "documents"("category");

-- Document requests (requests for a document to be uploaded)
CREATE TABLE "document_requests" (
    "id"           TEXT NOT NULL,
    "tenant_id"    TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "description"  TEXT,
    "category"     "DocumentCategory",
    "status"       "DocRequestStatus" NOT NULL DEFAULT 'PENDING',
    "fulfiller_id" TEXT,
    "document_id"  TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_requests_tenant_id_idx" ON "document_requests"("tenant_id");
CREATE INDEX "document_requests_status_idx"    ON "document_requests"("status");
