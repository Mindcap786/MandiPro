-- 1. Add internal_id to commodities (Items)
ALTER TABLE mandi.commodities ADD COLUMN IF NOT EXISTS internal_id VARCHAR(100);

-- Enforce Uniqueness: Per Organization for Commodities
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_commodity_internal_id 
ON mandi.commodities(organization_id, internal_id) 
WHERE internal_id IS NOT NULL AND internal_id != '';

-- 2. Add internal_id to contacts (Farmers, Buyers, Staff)
ALTER TABLE mandi.contacts ADD COLUMN IF NOT EXISTS internal_id VARCHAR(100);

-- Enforce Uniqueness: Per Organization + Per Type for Contacts
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_contact_internal_id_type_org 
ON mandi.contacts(organization_id, type, internal_id) 
WHERE internal_id IS NOT NULL AND internal_id != '';
