-- Migration: Add GSTIN and State Code to Contacts
-- Created: 2026-04-21
-- Purpose: Support high-fidelity tax reporting and POS buyer identification

ALTER TABLE mandi.contacts 
ADD COLUMN IF NOT EXISTS gstin TEXT,
ADD COLUMN IF NOT EXISTS state_code TEXT;

COMMENT ON COLUMN mandi.contacts.gstin IS 'GST Identification Number for Taxable entities';
COMMENT ON COLUMN mandi.contacts.state_code IS '2-digit State Code for Place of Supply identification';
