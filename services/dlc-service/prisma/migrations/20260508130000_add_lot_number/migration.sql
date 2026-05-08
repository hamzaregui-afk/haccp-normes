-- Migration: add lot_number to dlc_labels
-- ARCH-DECISION: lotNumber is a mandatory HACCP traceability field (batch ID).
-- It was present in the UI but missing from the DB schema. Added as nullable
-- so existing rows are not affected and legacy labels without a lot number remain valid.

ALTER TABLE "dlc_labels" ADD COLUMN "lot_number" TEXT;
