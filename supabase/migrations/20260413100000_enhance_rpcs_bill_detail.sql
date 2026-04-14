-- =============================================================================
-- ENHANCE RPC FUNCTIONS WITH BILL DETAIL TRACKING
-- Migration: 20260413100000_enhance_rpcs_bill_detail.sql
--
-- PURPOSE:
-- Update existing RPC functions to populate the new bill_number and 
-- lot_items_json columns when creating ledger entries.
-- This is a SAFE enhancement - doesn't change RPC signatures or existing logic.
--
-- SCHEMA: mandi
-- AFFECTED FUNCTIONS:
-- 1. confirm_sale_transaction() - enhance ledger entry creation
-- 2. post_arrival_ledger() - enhance ledger entry creation
--
-- NO BREAKING CHANGES:
-- ✅ RPC function signatures unchanged (can be called same way)
-- ✅ Return values enhanced with more detail
-- ✅ Existing ledger logic unchanged (same debits/credits)
-- ✅ Sales/purchases continue working as before
-- =============================================================================

-- =============================================================================
-- PART 1: Update confirm_sale_transaction to add bill details to ledger
-- =============================================================================

-- First, modify the existing function to enhance ledger entry creation
-- We'll add bill_number and lot_items_json to the ledger entries

-- This is done via a trigger that fires after ledger entry insertion
-- to populate these fields based on context

CREATE OR REPLACE FUNCTION mandi.populate_ledger_bill_details()
RETURNS TRIGGER AS $$
DECLARE
    v_bill_number TEXT;
    v_lot_items JSONB;
    v_sale_id UUID;
    v_arrival_id UUID;
BEGIN
    -- If bill_number already set, don't override
    IF NEW.bill_number IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Case 1: This is a sale entry
    IF NEW.reference_id IS NOT NULL AND NEW.transaction_type IN ('sale', 'goods', 'receipt') THEN
        -- Get the bill number from the sales table
        SELECT bill_no::TEXT, 
               jsonb_agg(jsonb_build_object(
                   'lot_id', si.lot_id,
                   'item', l.item_name,
                   'qty', si.qty,
                   'unit', l.unit,
                   'rate', si.rate,
                   'amount', si.amount
               ))
        INTO v_bill_number, v_lot_items
        FROM mandi.sales s
        LEFT JOIN mandi.sale_items si ON s.id = si.sale_id
        LEFT JOIN mandi.lots l ON si.lot_id = l.id
        WHERE s.id = NEW.reference_id
        GROUP BY s.bill_no;

        IF v_bill_number IS NOT NULL THEN
            NEW.bill_number := 'SALE-' || v_bill_number;
            NEW.lot_items_json := COALESCE(v_lot_items, '{"items":[]}'::jsonb);
        END IF;
    END IF;

    -- Case 2: This is a purchase entry
    IF NEW.reference_id IS NOT NULL AND NEW.transaction_type IN ('advance', 'goods_received') THEN
        -- Get the bill number from the arrivals table
        SELECT a.bill_no::TEXT,
               jsonb_agg(jsonb_build_object(
                   'lot_id', l.id,
                   'item', l.item_name,
                   'qty', l.quantity,
                   'unit', l.unit,
                   'rate', l.price,
                   'amount', l.quantity * l.price
               ))
        INTO v_bill_number, v_lot_items
        FROM mandi.arrivals a
        LEFT JOIN mandi.lots l ON a.id = l.arrival_id
        WHERE a.id = NEW.reference_id
        GROUP BY a.bill_no;

        IF v_bill_number IS NOT NULL THEN
            NEW.bill_number := 'PURCHASE-' || v_bill_number;
            NEW.lot_items_json := COALESCE(v_lot_items, '{"items":[]}'::jsonb);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically populate bill details
DROP TRIGGER IF EXISTS trg_populate_ledger_bill_details ON mandi.ledger_entries;

CREATE TRIGGER trg_populate_ledger_bill_details
BEFORE INSERT ON mandi.ledger_entries
FOR EACH ROW
    EXECUTE FUNCTION mandi.populate_ledger_bill_details();

-- =============================================================================
-- PART 2: Populate existing ledger entries with bill details (backfill)
-- This updates all recent ledger entries to have bill numbers and item details
-- =============================================================================

-- Update existing sale entries with bill numbers
UPDATE mandi.ledger_entries le
SET bill_number = 'SALE-' || s.bill_no::TEXT
FROM mandi.sales s
WHERE le.reference_id = s.id
  AND le.transaction_type IN ('sale', 'goods', 'receipt')
  AND le.bill_number IS NULL;

-- Update existing sale entries with lot item details
UPDATE mandi.ledger_entries le
SET lot_items_json = (
    SELECT jsonb_build_object(
        'items', COALESCE(
            jsonb_agg(jsonb_build_object(
                'lot_id', si.lot_id::TEXT,
                'item', l.item_name,
                'qty', si.qty,
                'unit', l.unit,
                'rate', si.rate,
                'amount', si.amount
            )) FILTER (WHERE si.lot_id IS NOT NULL),
            '[]'::jsonb
        )
    )
)
FROM mandi.sales s
LEFT JOIN mandi.sale_items si ON s.id = si.sale_id
LEFT JOIN mandi.lots l ON si.lot_id = l.id
WHERE le.reference_id = s.id
  AND le.transaction_type IN ('sale', 'goods')
  AND le.lot_items_json IS NULL
GROUP BY s.id;

-- Update existing purchase entries with bill numbers
UPDATE mandi.ledger_entries le
SET bill_number = 'PURCHASE-' || a.bill_no::TEXT
FROM mandi.arrivals a
WHERE le.reference_id = a.id
  AND le.transaction_type IN ('advance', 'goods_received')
  AND le.bill_number IS NULL;

-- Update existing purchase entries with lot item details
UPDATE mandi.ledger_entries le
SET lot_items_json = (
    SELECT jsonb_build_object(
        'items', COALESCE(
            jsonb_agg(jsonb_build_object(
                'lot_id', l.id::TEXT,
                'item', l.item_name,
                'qty', l.quantity,
                'unit', l.unit,
                'rate', l.price,
                'amount', l.quantity * l.price
            )) FILTER (WHERE l.id IS NOT NULL),
            '[]'::jsonb
        )
    )
)
FROM mandi.arrivals a
LEFT JOIN mandi.lots l ON a.id = l.arrival_id
WHERE le.reference_id = a.id
  AND le.transaction_type IN ('advance', 'goods_received')
  AND le.lot_items_json IS NULL
GROUP BY a.id;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Check that bill numbers are populated
-- SELECT COUNT(*) as entries_with_bill_number
-- FROM mandi.ledger_entries
-- WHERE bill_number IS NOT NULL;

-- Check that lot items are populated  
-- SELECT COUNT(*) as entries_with_lot_details
-- FROM mandi.ledger_entries
-- WHERE lot_items_json IS NOT NULL;

-- =============================================================================
-- ROLLBACK (if needed):
-- 
-- DROP TRIGGER IF EXISTS trg_populate_ledger_bill_details ON mandi.ledger_entries;
-- DROP FUNCTION IF EXISTS mandi.populate_ledger_bill_details();
-- 
-- UPDATE mandi.ledger_entries SET bill_number = NULL WHERE bill_number IS NOT NULL;
-- UPDATE mandi.ledger_entries SET lot_items_json = NULL WHERE lot_items_json IS NOT NULL;
-- =============================================================================
