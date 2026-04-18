-- ============================================================================
-- MIGRATION: 20260418_add_internal_ids.sql
-- PURPOSE: Add internal_id (INTEGER) to commodities and contacts with constraints.
-- ============================================================================

BEGIN;

-- 1. Add internal_id to commodities
ALTER TABLE mandi.commodities ADD COLUMN IF NOT EXISTS internal_id INTEGER;

-- Enforce: No duplicate internal_id per organization (excluding nulls)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_item_internal_id 
ON mandi.commodities(organization_id, internal_id) 
WHERE internal_id IS NOT NULL;

-- 2. Add internal_id to contacts
ALTER TABLE mandi.contacts ADD COLUMN IF NOT EXISTS internal_id INTEGER;

-- Enforce: No duplicate internal_id PER TYPE per organization (excluding nulls)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_contact_internal_id_per_type 
ON mandi.contacts(organization_id, type, internal_id) 
WHERE internal_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
