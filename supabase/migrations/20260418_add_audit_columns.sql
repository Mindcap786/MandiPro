-- ============================================================================
-- MIGRATION: Universal Audit Column Fix
-- Date: 2026-04-18
--
-- RCA (Root Cause Analysis):
-- • During the massive schema domain-isolation on April 15th, core transactional
--   tables (lots, sales, sale_items, payments) were rebuilt without the 
--   standard `created_by` audit logging columns.
-- • The frontend APIs strictly enforce audit accountability by passing `created_by`
--   (the active user) to every RPC call.
-- • When the RPCs (`create_mixed_arrival` and `confirm_sale_transaction`) execute,
--   they attempt to map this payload to the database, causing hard crashes.
-- ============================================================================

-- Safely verify and add `created_by` audit columns to all transactional tables.
ALTER TABLE mandi.lots 
  ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE mandi.sales 
  ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE mandi.sale_items 
  ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE mandi.payments 
  ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE mandi.cheques 
  ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE mandi.ledger_entries 
  ADD COLUMN IF NOT EXISTS created_by UUID;

-- Optional but recommended for robust tracking
ALTER TABLE mandi.purchase_bills 
  ADD COLUMN IF NOT EXISTS created_by UUID;

-- Explicitly grant SELECT and INSERT visibility on these columns
GRANT SELECT, INSERT ON mandi.lots TO authenticated, service_role;
GRANT SELECT, INSERT ON mandi.sales TO authenticated, service_role;
GRANT SELECT, INSERT ON mandi.sale_items TO authenticated, service_role;

-- Reload schema so PostgREST recognizes the new columns immediately
NOTIFY pgrst, 'reload schema';
