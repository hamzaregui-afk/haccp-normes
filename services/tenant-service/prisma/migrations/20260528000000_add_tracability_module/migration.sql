-- Migration: add_tracability_module
-- Adds TRACABILITY value to TenantModuleKey enum.
-- Safe to run multiple times — ALTER TYPE ADD VALUE IF NOT EXISTS.
-- PostgreSQL 9.1+ supports ALTER TYPE ... ADD VALUE.

ALTER TYPE "TenantModuleKey" ADD VALUE IF NOT EXISTS 'TRACABILITY';
