-- Migration: Remove ControlType enum and type column from control_templates
-- ARCH-DECISION: The template "type" (RECEPTION, TEMPERATURE_STOCK, etc.) was
-- a rigid classification that added little value — operators described intent
-- through the template name and checklist structure. Removing it simplifies
-- the form, the schema, and avoids forcing users to pick from a fixed taxonomy.
-- The item-level type (BOOLEAN, NUMBER, TEXT, TEMPERATURE, etc.) is preserved.

ALTER TABLE "control_templates" DROP COLUMN IF EXISTS "type";

DROP TYPE IF EXISTS "ControlType";
