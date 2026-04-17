-- ============================================================
-- ADD AMOUNT_RECEIVED FIELD TO SALES TABLE
-- Migration: 20260412200000_add_amount_received_to_sales.sql
--
-- FIX: Store amount_received so invoice detail page can display pending amount
-- ============================================================

-- Step 1: Add amount_received column to sales table
ALTER TABLE mandi.sales
ADD COLUMN IF NOT EXISTS amount_received NUMERIC DEFAULT 0;

-- Step 2: Update existing sales with correct amounts
-- For PAID invoices, amount_received = total_amount_inc_tax
UPDATE mandi.sales
SET amount_received = total_amount_inc_tax
WHERE payment_status = 'paid'
  AND amount_received = 0;

-- For PARTIAL invoices, they may need manual review (amount_received expected to be set already)

-- For PENDING invoices, amount_received = 0 (no payment yet)
UPDATE mandi.sales
SET amount_received = 0
WHERE payment_status = 'pending'
  AND amount_received IS NULL;
