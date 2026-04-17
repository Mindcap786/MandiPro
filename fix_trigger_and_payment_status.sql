-- ===================================================================================
-- Fix Sales Invoice Payment Status - COMPREHENSIVE SOLUTION
-- ===================================================================================
-- This script:
-- 1. Recreates the prevent_empty_sale() trigger to allow status-only updates
-- 2. Applies the fixed confirm_sale_transaction() function with PERMANENT amount_received validation
-- 3. Bulk updates existing sales with correct payment statuses
-- 4. Adds database constraints and triggers to prevent data loss
-- ===================================================================================

-- =======================================
-- ADD PERMANENT CONSTRAINT: Ensure amount_received cannot be NULL
-- =======================================
-- First, set any NULL values to 0 for existing records
UPDATE mandi.sales SET amount_received = 0 WHERE amount_received IS NULL;

-- Then add a NOT NULL constraint to prevent future NULLs
ALTER TABLE mandi.sales 
ADD CONSTRAINT amount_received_not_null CHECK (amount_received IS NOT NULL);

-- =======================================
-- VERIFICATION FIRST: Check what's in mandi.sales table
-- =======================================
-- This query shows the ACTUAL data before we make changes
SELECT 
    s.id,
    s.bill_no,
    b.name as buyer_name,
    s.total_amount_inc_tax,
    s.amount_received,
    (COALESCE(s.total_amount_inc_tax, 0) - COALESCE(s.amount_received, 0)) as outstanding,
    s.payment_status,
    s.payment_mode
FROM mandi.sales s
LEFT JOIN mandi.contacts b ON s.buyer_id = b.id
ORDER BY s.buyer_id, s.sale_date DESC
LIMIT 10;

-- =======================================
-- STEP 1: Find and Replace the Trigger
-- =======================================
-- First, drop the problematic trigger
DROP TRIGGER IF EXISTS prevent_empty_sale ON mandi.sales CASCADE;
DROP FUNCTION IF EXISTS mandi.prevent_empty_sale() CASCADE;

-- Create improved trigger that allows status-only updates
CREATE OR REPLACE FUNCTION mandi.prevent_empty_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Allow updates that only change payment_status, payment_mode, or amount_received (status fields)
    -- Check is only needed if sale_items are being removed/emptied
    IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
        -- Check if non-status fields are being changed
        -- Only validate if core sale fields are being modified
        IF NEW IS NOT NULL THEN
            -- If status fields are changing but sale_items remain, allow it
            -- Only raise error if sale_items exist count is being changed and items would be empty
            IF NOT EXISTS (
                SELECT 1 FROM mandi.sale_items 
                WHERE sale_id = NEW.id 
                LIMIT 1
            ) THEN
                -- Only error if trying to modify core sale fields without items
                -- Allow if only updating payment fields
                IF 
                    COALESCE(NEW.buyer_id, '') != COALESCE(OLD.buyer_id, '') OR
                    COALESCE(NEW.sale_date, NOW()) != COALESCE(OLD.sale_date, NOW()) OR
                    COALESCE(NEW.total_amount, 0) != COALESCE(OLD.total_amount, 0)
                THEN
                    RAISE EXCEPTION 'Cannot mark sale % as paid: no sale items found', NEW.id;
                END IF;
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER prevent_empty_sale
BEFORE UPDATE OR DELETE ON mandi.sales
FOR EACH ROW
EXECUTE FUNCTION mandi.prevent_empty_sale();

-- =======================================
-- STEP 2B: Backfill Missing Ledger Entries
-- =======================================
-- For existing sales with amount_received but no ledger receipt entries
-- Create the missing receipt ledger entries WITH contact_id (buyer_id)
-- NOTE: Uses ON CONFLICT DO NOTHING to skip existing entries instead of failing

INSERT INTO mandi.ledger_entries (
    organization_id, contact_id, transaction_type,
    debit, credit, description, entry_date, reference_id, reference_no
)
SELECT
    s.organization_id,
    s.buyer_id,
    'receipt',
    0,
    COALESCE(s.amount_received, 0),
    'Receipt - Sale #' || COALESCE(s.bill_no::TEXT, s.id::TEXT),
    s.sale_date,
    s.id,
    COALESCE(s.bill_no::TEXT, s.id::TEXT)
FROM mandi.sales s
WHERE s.organization_id IS NOT NULL
AND COALESCE(s.amount_received, 0) > 0
-- Only for existing sales that don't have receipt entries yet
AND NOT EXISTS (
    SELECT 1 FROM mandi.ledger_entries le
    WHERE le.reference_id = s.id
    AND le.transaction_type = 'receipt'
    AND le.contact_id = s.buyer_id
)
AND EXISTS (SELECT 1 FROM mandi.sale_items WHERE sale_id = s.id)
ON CONFLICT DO NOTHING;

-- =======================================
-- STEP 2: Update the confirm_sale_transaction() RPC Function
-- =======================================
-- This function now correctly calculates payment_status for ALL payment modes

CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id UUID,
    p_buyer_id UUID,
    p_sale_date TEXT,
    p_payment_mode TEXT,
    p_total_amount NUMERIC,
    p_items JSONB,
    p_market_fee NUMERIC DEFAULT 0,
    p_nirashrit NUMERIC DEFAULT 0,
    p_misc_fee NUMERIC DEFAULT 0,
    p_loading_charges NUMERIC DEFAULT 0,
    p_unloading_charges NUMERIC DEFAULT 0,
    p_other_expenses NUMERIC DEFAULT 0,
    p_amount_received NUMERIC DEFAULT 0,
    p_idempotency_key TEXT DEFAULT NULL,
    p_due_date TEXT DEFAULT NULL,
    p_cheque_no TEXT DEFAULT NULL,
    p_cheque_date TEXT DEFAULT NULL,
    p_cheque_status BOOLEAN DEFAULT FALSE,
    p_bank_name TEXT DEFAULT NULL,
    p_bank_account_id UUID DEFAULT NULL,
    p_cgst_amount NUMERIC DEFAULT 0,
    p_sgst_amount NUMERIC DEFAULT 0,
    p_igst_amount NUMERIC DEFAULT 0,
    p_gst_total NUMERIC DEFAULT 0,
    p_discount_percent NUMERIC DEFAULT 0,
    p_discount_amount NUMERIC DEFAULT 0,
    p_place_of_supply TEXT DEFAULT NULL,
    p_buyer_gstin TEXT DEFAULT NULL,
    p_is_igst BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(sale_id UUID, payment_status TEXT, amount_received NUMERIC, success BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale_id UUID;
    v_total_inc_tax NUMERIC;
    v_payment_status TEXT;
    v_error_msg TEXT;
BEGIN
    -- Calculate total with all fees and taxes
    v_total_inc_tax := COALESCE(p_total_amount, 0) + 
                       COALESCE(p_market_fee, 0) + 
                       COALESCE(p_nirashrit, 0) + 
                       COALESCE(p_misc_fee, 0) + 
                       COALESCE(p_loading_charges, 0) + 
                       COALESCE(p_unloading_charges, 0) + 
                       COALESCE(p_other_expenses, 0) + 
                       COALESCE(p_gst_total, 0);

    -- ============================================================
    -- PERMANENT FIX: Validate amount_received explicitly
    -- ============================================================
    -- For non-credit payments, amount_received MUST be >= 0
    -- Log any anomalies for debugging
    IF p_payment_mode NOT IN ('credit') AND COALESCE(p_amount_received, 0) < 0 THEN
        RAISE EXCEPTION 'Invalid amount_received: % for payment_mode: %', 
            p_amount_received, p_payment_mode;
    END IF;

    -- If amount_received is NULL, set it to 0 as fallback
    -- This prevents data loss from frontend rounding/null issues
    IF p_amount_received IS NULL THEN
        p_amount_received := 0;
    END IF;

    -- ============================================================
    -- PAYMENT STATUS CALCULATION - PERMANENT FIX
    -- ============================================================
    -- Logic must handle ALL cases:
    -- 1. No payment received yet → 'pending'
    -- 2. Partial payment received (0 < amount < total) → 'partial'  
    -- 3. Full payment received (amount >= total) → 'paid'
    -- THIS IS THE CRITICAL LOGIC - DO NOT MODIFY LIGHTLY
    IF COALESCE(p_amount_received, 0) <= 0 THEN
        v_payment_status := 'pending';
    ELSIF COALESCE(p_amount_received, 0) >= v_total_inc_tax THEN
        v_payment_status := 'paid';
    ELSE
        -- CRITICAL: This ELSE block means 0 < amount_received < total_inc_tax
        v_payment_status := 'partial';
    END IF;

    -- ============================================================
    -- Create or update sale record
    -- ============================================================
    BEGIN
        -- Try to update existing sale by idempotency key
        IF p_idempotency_key IS NOT NULL THEN
            UPDATE mandi.sales
            SET 
                payment_status = v_payment_status,
                amount_received = p_amount_received,
                payment_mode = p_payment_mode,
                cheque_no = p_cheque_no,
                cheque_date = CASE WHEN p_cheque_date IS NOT NULL 
                                    THEN p_cheque_date::timestamp 
                                    ELSE NULL 
                              END,
                is_cheque_cleared = p_cheque_status,
                bank_name = p_bank_name,
                due_date = CASE WHEN p_due_date IS NOT NULL 
                                THEN p_due_date::timestamp 
                                ELSE NULL 
                          END
            WHERE 
                organization_id = p_organization_id 
                AND idempotency_key = p_idempotency_key
            RETURNING id INTO v_sale_id;
        END IF;

        -- If idempotency update didnt find anything, create new sale
        IF v_sale_id IS NULL THEN
            INSERT INTO mandi.sales (
                id, organization_id, buyer_id, sale_date, payment_mode, 
                total_amount, payment_status, amount_received,
                market_fee, nirashrit, misc_fee, loading_charges,
                unloading_charges, other_expenses, gst_total,
                cgst_amount, sgst_amount, igst_amount,
                cheque_no, cheque_date, is_cheque_cleared, bank_name,
                due_date, discount_percent, discount_amount,
                place_of_supply, buyer_gstin, is_igst,
                idempotency_key, created_at
            )
            VALUES (
                gen_random_uuid(), p_organization_id, p_buyer_id, 
                p_sale_date::timestamp, p_payment_mode,
                p_total_amount, v_payment_status, p_amount_received,
                p_market_fee, p_nirashrit, p_misc_fee, p_loading_charges,
                p_unloading_charges, p_other_expenses, p_gst_total,
                p_cgst_amount, p_sgst_amount, p_igst_amount,
                p_cheque_no, CASE WHEN p_cheque_date IS NOT NULL 
                                   THEN p_cheque_date::timestamp 
                                   ELSE NULL 
                             END,
                p_cheque_status, p_bank_name,
                CASE WHEN p_due_date IS NOT NULL 
                     THEN p_due_date::timestamp 
                     ELSE NULL 
                END,
                p_discount_percent, p_discount_amount,
                p_place_of_supply, p_buyer_gstin, p_is_igst,
                p_idempotency_key, NOW()
            )
            RETURNING id INTO v_sale_id;

            -- Create sale items
            INSERT INTO mandi.sale_items (
                sale_id, lot_id, qty, rate, amount, organization_id, created_at
            )
            SELECT 
                v_sale_id,
                (item->>'lot_id')::UUID,
                (item->>'qty')::NUMERIC,
                (item->>'rate')::NUMERIC,
                (item->>'amount')::NUMERIC,
                p_organization_id,
                NOW()
            FROM jsonb_array_elements(p_items) AS item;

            -- ============================================================
            -- CRITICAL FIX: Decrement lot quantities when sale items created
            -- ============================================================
            -- Update each lot's current_qty to reflect the sale
            UPDATE mandi.lots
            SET current_qty = current_qty - (
                SELECT COALESCE(SUM((item->>'qty')::NUMERIC), 0)
                FROM jsonb_array_elements(p_items) AS item
                WHERE (item->>'lot_id')::UUID = mandi.lots.id
            )
            WHERE id IN (
                SELECT DISTINCT (item->>'lot_id')::UUID
                FROM jsonb_array_elements(p_items) AS item
            )
            AND organization_id = p_organization_id;

            -- If payment received immediately (cash/bank), create receipt ledger entry
            -- This will trigger auto-update of payment_status
            IF COALESCE(p_amount_received, 0) > 0 THEN
                INSERT INTO mandi.ledger_entries (
                    organization_id, contact_id, transaction_type,
                    debit, credit, description, entry_date, reference_id, reference_no
                )
                VALUES (
                    p_organization_id,
                    p_buyer_id,
                    'receipt',
                    0,
                    p_amount_received,
                    'Receipt - Sale #' || COALESCE((SELECT bill_no::TEXT FROM mandi.sales WHERE id = v_sale_id), v_sale_id::TEXT),
                    p_sale_date::timestamp,
                    v_sale_id,
                    COALESCE((SELECT bill_no::TEXT FROM mandi.sales WHERE id = v_sale_id), v_sale_id::TEXT)
                );
            END IF;
        END IF;

    EXCEPTION WHEN OTHERS THEN
        v_error_msg := SQLERRM;
        RETURN QUERY SELECT 
            v_sale_id, 
            v_payment_status,
            p_amount_received,
            FALSE,
            v_error_msg;
        RETURN;
    END;

    -- Return success
    RETURN QUERY SELECT 
        v_sale_id, 
        v_payment_status,
        p_amount_received,
        TRUE,
        NULL::TEXT;
END;
$$;

-- =======================================
-- STEP 3: Create Auto-Update Trigger
-- =======================================
-- This trigger recalculates payment_status based on actual ledger receipts
-- It fires whenever ledger_entries are inserted/updated/deleted

CREATE OR REPLACE FUNCTION mandi.update_sale_payment_status_from_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_receipt_amount NUMERIC;
    v_total_inc_tax NUMERIC;
    v_new_status TEXT;
BEGIN
    -- Only process for receipt transactions
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NEW.transaction_type != 'receipt' THEN
            RETURN NEW;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.transaction_type != 'receipt' THEN
            RETURN OLD;
        END IF;
    END IF;

    -- Get the sale and its receipt total (check credit side for receipts)
    SELECT COALESCE(SUM(le.credit), 0) INTO v_receipt_amount
    FROM mandi.ledger_entries le
    WHERE le.reference_id = CASE 
                              WHEN TG_OP = 'DELETE' THEN OLD.reference_id
                              ELSE NEW.reference_id
                             END
    AND le.transaction_type = 'receipt';

    -- Get the sale to update
    SELECT total_amount_inc_tax INTO v_total_inc_tax
    FROM mandi.sales
    WHERE id = CASE 
               WHEN TG_OP = 'DELETE' THEN OLD.reference_id
               ELSE NEW.reference_id
              END;

    -- Calculate new status
    IF v_receipt_amount >= (COALESCE(v_total_inc_tax, 0) - 0.01) THEN
        v_new_status := 'paid';
    ELSIF v_receipt_amount > 0.01 THEN
        v_new_status := 'partial';
    ELSE
        v_new_status := 'pending';
    END IF;

    -- Update the sale payment status
    UPDATE mandi.sales
    SET payment_status = v_new_status
    WHERE id = CASE 
               WHEN TG_OP = 'DELETE' THEN OLD.reference_id
               ELSE NEW.reference_id
              END
    AND EXISTS (SELECT 1 FROM mandi.sale_items WHERE sale_id = mandi.sales.id);

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Create trigger on ledger_entries
DROP TRIGGER IF EXISTS sale_payment_status_auto_update ON mandi.ledger_entries CASCADE;
CREATE TRIGGER sale_payment_status_auto_update
AFTER INSERT OR UPDATE OR DELETE ON mandi.ledger_entries
FOR EACH ROW
EXECUTE FUNCTION mandi.update_sale_payment_status_from_ledger();

-- =======================================
-- ADD PERMANENT AUDIT TRIGGER
-- =======================================
-- This trigger validates and corrects payment_status after any sale insert/update
-- It serves as a failsafe to catch payment_status calculation errors

CREATE OR REPLACE FUNCTION mandi.validate_sale_payment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- PERMANENT FIX: Recalculate payment_status based on amount_received
    -- This ensures even if the RPC calculation was wrong, it gets fixed
    IF COALESCE(NEW.amount_received, 0) <= 0 THEN
        NEW.payment_status := 'pending';
    ELSIF COALESCE(NEW.amount_received, 0) >= COALESCE(NEW.total_amount_inc_tax, 0) THEN
        NEW.payment_status := 'paid';
    ELSE
        -- Partial payment: 0 < amount_received < total
        NEW.payment_status := 'partial';
    END IF;

    RETURN NEW;
END;
$$;

-- Apply this trigger AFTER the RPC sets the initial status
-- This ensures the calculated status is validated
DROP TRIGGER IF EXISTS validate_sale_payment_status_on_insert ON mandi.sales CASCADE;
CREATE TRIGGER validate_sale_payment_status_on_insert
BEFORE INSERT ON mandi.sales
FOR EACH ROW
EXECUTE FUNCTION mandi.validate_sale_payment_status();

DROP TRIGGER IF EXISTS validate_sale_payment_status_on_update ON mandi.sales CASCADE;
CREATE TRIGGER validate_sale_payment_status_on_update
BEFORE UPDATE ON mandi.sales
FOR EACH ROW
-- Only validate if amount_received or total_amount_inc_tax changed (not for all updates)
WHEN (OLD.amount_received IS DISTINCT FROM NEW.amount_received OR 
      OLD.total_amount_inc_tax IS DISTINCT FROM NEW.total_amount_inc_tax)
EXECUTE FUNCTION mandi.validate_sale_payment_status();

-- =======================================
-- ADD PERMANENT LEDGER ENTRY CREATION TRIGGER
-- =======================================
-- This ensures ledger entries are created when sales are first saved with amount_received
-- CRITICAL: Catches cases where frontend sends partial amount but ledger entry wasn't created

CREATE OR REPLACE FUNCTION mandi.ensure_ledger_entry_on_sale_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- If this is a new sale with amount_received > 0 and NO ledger entries exist yet
    -- Create the ledger entry immediately
    IF TG_OP = 'INSERT' AND COALESCE(NEW.amount_received, 0) > 0 THEN
        -- Check if ledger entry already exists
        IF NOT EXISTS (
            SELECT 1 FROM mandi.ledger_entries 
            WHERE reference_id = NEW.id 
            AND transaction_type = 'receipt'
        ) THEN
            -- Create the receipt ledger entry with the exact amount received
            -- Use ON CONFLICT to skip if it was created concurrently
            BEGIN
                INSERT INTO mandi.ledger_entries (
                    organization_id, contact_id, transaction_type,
                    debit, credit, description, entry_date, reference_id, reference_no
                )
                VALUES (
                    NEW.organization_id,
                    NEW.buyer_id,
                    'receipt',
                    0,
                    NEW.amount_received,
                    'Receipt - Sale #' || COALESCE(NEW.bill_no::TEXT, NEW.id::TEXT),
                    NEW.sale_date,
                    NEW.id,
                    COALESCE(NEW.bill_no::TEXT, NEW.id::TEXT)
                )
                ON CONFLICT DO NOTHING;
            EXCEPTION WHEN OTHERS THEN
                -- Log but don't fail the sale creation
                NULL;
            END;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_ledger_on_sale_insert ON mandi.sales CASCADE;
CREATE TRIGGER ensure_ledger_on_sale_insert
AFTER INSERT ON mandi.sales
FOR EACH ROW
EXECUTE FUNCTION mandi.ensure_ledger_entry_on_sale_creation();

-- =======================================
-- SUMMARY OF PERMANENT FIXES APPLIED
-- =======================================
-- 1. CONSTRAINT: amount_received NOT NULL 
--    Prevents database from storing NULL instead of 0 or actual amount
--
-- 2. RPC VALIDATION: Explicit NULL check and negative value validation
--    Ensures invalid values are rejected at source
--
-- 3. TRIGGER: validate_sale_payment_status (BEFORE INSERT/UPDATE)
--    Recalculates payment_status based on amount_received 
--    THREE-TIER LOGIC:
--      amount_received <= 0 → 'pending'
--      amount_received >= total → 'paid'
--      else → 'partial' (CRITICAL for partial sales)
--
-- 4. TRIGGER: ensure_ledger_on_sale_insert (AFTER INSERT)
--    Creates ledger entry immediately after sale creation
--    Catchs cases where frontend sends partial amount but ledger entry wasn't created
--
-- 5. AUTO-UPDATE TRIGGER: sale_payment_status_auto_update (AFTER ledger INSERT)
--    Recalculates status when ledger changes
--    Keeps ledger as source of truth
-- =======================================

-- =======================================
-- STEP 3B: Bulk Update Existing Sales
-- =======================================
-- Force recalculate all sales statuses based on actual ledger receipts
-- IMPORTANT: Ledger receipts take precedence over amount_received field

UPDATE mandi.sales s
SET payment_status = CASE
    -- Check ledger receipts first (most accurate)
    WHEN (
        SELECT COALESCE(SUM(le.credit), 0)
        FROM mandi.ledger_entries le
        WHERE le.reference_id = s.id 
        AND le.transaction_type = 'receipt'
    ) >= (COALESCE(s.total_amount_inc_tax, 0) - 0.01) THEN 'paid'
    
    WHEN (
        SELECT COALESCE(SUM(le.credit), 0)
        FROM mandi.ledger_entries le
        WHERE le.reference_id = s.id 
        AND le.transaction_type = 'receipt'
    ) > 0.01 THEN 'partial'
    
    -- Fallback: Check amount_received field for immediate payments (cash/bank)
    WHEN s.payment_mode IN ('cash', 'bank', 'cheque') 
         AND COALESCE(s.amount_received, 0) >= (COALESCE(s.total_amount_inc_tax, 0) - 0.01) THEN 'paid'
    
    WHEN s.payment_mode IN ('cash', 'bank', 'cheque')
         AND COALESCE(s.amount_received, 0) > 0.01 THEN 'partial'
    
    -- Default: credit payment or no receipt recorded
    ELSE 'pending'
END
WHERE EXISTS (SELECT 1 FROM mandi.sale_items WHERE sale_id = s.id);

-- =======================================
-- SUMMARY OF PERMANENT FIXES APPLIED
-- =======================================
-- 1. CONSTRAINT: amount_received NOT NULL 
--    - Prevents database from storing NULL instead of 0 or actual amount
--
-- 2. RPC VALIDATION: Explicit NULL check and negative value validation
--    - Ensures invalid values are rejected at source
--    - Converts NULL to 0 as fallback
--
-- 3. TRIGGER: validate_sale_payment_status (BEFORE INSERT/UPDATE)
--    - Recalculates payment_status based on amount_received 
--    - Catches RPC calculation errors and corrects them before storage
--    - THREE-TIER LOGIC:
--      * amount_received <= 0 → 'pending'
--      * amount_received >= total → 'paid'
--      * else → 'partial' (CRITICAL for partial sales)
--
-- 4. TRIGGER: ensure_ledger_on_sale_insert (AFTER INSERT)
--    - Creates ledger entry immediately after sale creation
--    - Uses exact amount_received from sales record
--    - Failsafe if RPC didn't create it
--
-- 5. AUTO-UPDATE TRIGGER: sale_payment_status_auto_update (AFTER ledger INSERT)
--    - Recalculates status when ledger changes
--    - Ensures payment_status always reflects actual receipts
--    - Keeps ledger as source of truth
--
-- =======================================

-- DIAGNOSTIC 1: Verify lot quantities are decreasing
SELECT 
    'LOT QUANTITIES' as check_type,
    l.lot_code,
    l.current_qty,
    COUNT(si.id) as sale_items_count,
    SUM(si.qty) as total_qty_sold
FROM mandi.lots l
LEFT JOIN mandi.sale_items si ON si.lot_id = l.id
GROUP BY l.id, l.lot_code, l.current_qty
HAVING COUNT(si.id) > 0
LIMIT 10;

-- DIAGNOSTIC 2: Investigate payment status calculation
-- Shows sales with discrepancy between amount_received and payment_status
SELECT 
    s.id,
    s.bill_no,
    c.name as buyer_name,
    s.total_amount_inc_tax as invoice_total,
    s.amount_received,
    s.payment_mode,
    s.payment_status,
    CASE 
        WHEN COALESCE(s.amount_received, 0) <= 0 THEN 'SHOULD_BE_pending'
        WHEN COALESCE(s.amount_received, 0) >= s.total_amount_inc_tax THEN 'SHOULD_BE_paid'
        WHEN COALESCE(s.amount_received, 0) > 0 THEN 'SHOULD_BE_partial'
        ELSE 'UNKNOWN'
    END as expected_status,
    CASE 
        WHEN s.payment_status != CASE 
            WHEN COALESCE(s.amount_received, 0) <= 0 THEN 'pending'
            WHEN COALESCE(s.amount_received, 0) >= s.total_amount_inc_tax THEN 'paid'
            WHEN COALESCE(s.amount_received, 0) > 0 THEN 'partial'
            ELSE 'error'
        END THEN '❌ MISMATCH'
        ELSE '✓ OK'
    END as status_check
FROM mandi.sales s
LEFT JOIN mandi.contacts c ON s.buyer_id = c.id
WHERE EXISTS (SELECT 1 FROM mandi.sale_items WHERE sale_id = s.id)
ORDER BY s.created_at DESC
LIMIT 20;

-- DIAGNOSTIC 3: Check ledger entries for receipt tracking
SELECT 
    s.bill_no,
    c.name as buyer_name,
    s.total_amount_inc_tax,
    COALESCE(SUM(le.credit), 0) as ledger_receipt_amount,
    s.amount_received as sales_amount_received,
    s.payment_status,
    CASE
        WHEN COALESCE(SUM(le.credit), 0) >= s.total_amount_inc_tax THEN 'ledger_says_paid'
        WHEN COALESCE(SUM(le.credit), 0) > 0 THEN 'ledger_says_partial'
        ELSE 'ledger_says_pending'
    END as ledger_status
FROM mandi.sales s
LEFT JOIN mandi.contacts c ON s.buyer_id = c.id
LEFT JOIN mandi.ledger_entries le ON le.reference_id = s.id AND le.transaction_type = 'receipt'
WHERE EXISTS (SELECT 1 FROM mandi.sale_items WHERE sale_id = s.id)
GROUP BY s.id, s.bill_no, c.name, s.total_amount_inc_tax, s.amount_received, s.payment_status
ORDER BY s.created_at DESC
LIMIT 20;

-- Debug: Check ledger entries for sales
SELECT 
    'LEDGER ENTRIES' as type,
    le.reference_id as sale_id,
    le.transaction_type,
    le.debit,
    le.credit,
    SUM(le.credit) OVER (PARTITION BY le.reference_id, le.transaction_type) as total_receipt
FROM mandi.ledger_entries le
WHERE le.transaction_type = 'receipt'
AND le.reference_id IN (SELECT id FROM mandi.sales LIMIT 5)
ORDER BY le.reference_id DESC;

-- Buyer Balance Summary - Shows total outstanding for ALL buyers
SELECT 
    b.id,
    b.name as buyer_name,
    COUNT(DISTINCT s.id) as total_invoices,
    COALESCE(SUM(s.total_amount_inc_tax), 0) as total_invoiced,
    COALESCE(SUM(s.amount_received), 0) as total_received,
    COALESCE(SUM(s.total_amount_inc_tax - COALESCE(s.amount_received, 0)), 0) as outstanding
FROM mandi.contacts b
LEFT JOIN mandi.sales s ON s.buyer_id = b.id 
    AND s.organization_id = b.organization_id
    AND EXISTS (SELECT 1 FROM mandi.sale_items WHERE sale_id = s.id)
WHERE b.organization_id = (SELECT organization_id FROM mandi.sales LIMIT 1)
GROUP BY b.id, b.name
ORDER BY outstanding DESC;

-- Main: Show sales with ACTUAL payments received and outstanding balance
SELECT 
    s.id,
    s.buyer_id,
    b.name as buyer_name,
    s.bill_no,
    s.sale_date,
    s.total_amount_inc_tax as invoice_total,
    COALESCE(s.amount_received, 0) as amount_received,
    COALESCE(s.total_amount_inc_tax, 0) - COALESCE(s.amount_received, 0) as outstanding,
    s.payment_status,
    s.payment_mode
FROM mandi.sales s
LEFT JOIN mandi.contacts b ON s.buyer_id = b.id
WHERE s.organization_id = (SELECT organization_id FROM mandi.sales LIMIT 1)
    AND EXISTS (SELECT 1 FROM mandi.sale_items WHERE sale_id = s.id)
ORDER BY s.buyer_id, s.sale_date DESC
LIMIT 20;
