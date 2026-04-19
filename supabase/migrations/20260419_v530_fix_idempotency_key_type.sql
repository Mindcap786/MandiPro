-- =============================================================================
-- Migration v5.30: Fix mandi.sales.idempotency_key type mismatch (UUID → TEXT)
-- =============================================================================
-- ROOT CAUSE (confirmed 2026-04-19):
--
--   mandi.sales.idempotency_key column type: UUID   ← WRONG
--   mandi.confirm_sale_transaction param type: TEXT  ← CORRECT
--
--   The idempotency check at line 1 of the RPC does:
--     WHERE idempotency_key = p_idempotency_key
--   i.e., UUID column = TEXT parameter — PostgreSQL 42883 operator error!
--
--   The frontend sends crypto.randomUUID() as a TEXT string.
--   The function wraps everything in EXCEPTION WHEN OTHERS → RETURN jsonb
--   with success=false, error="operator does not exist: uuid = text".
--   The UI shows "Transaction Failed — operator does not exist: uuid = text".
--
-- WHO BROKE IT: A previous migration (likely for type-hardening) changed the 
--   column from TEXT to UUID without also casting the function parameter.
--   The column was always TEXT conceptually — idempotency keys are strings, 
--   not natural UUIDs. The data happened to be UUID strings so the column 
--   type change didn't break INSERTs until a comparison was attempted.
--
-- IMPACT: 100% of CASH/UPI/UPI-BANK sales fail production-wide.
--   Credit (UDHAAR) sales that pass NULL idempotency_key are NOT affected
--   because NULL comparisons don't trigger the operator mismatch.
--
-- TIMELINE: The error already existed before our Day Book migrations (v5.27-5.29).
--   Our Day Book fixes did NOT cause this issue.
--
-- FIX: Change column type to TEXT (zero data loss — all values are UUID strings).
--   Unique constraint is preserved. The function parameter stays TEXT (correct).
--   The dependent view v_sales_fast is dropped and identically recreated.
-- =============================================================================

-- Step 1: Drop dependent view (depends on idempotency_key column)
DROP VIEW IF EXISTS mandi.v_sales_fast CASCADE;

-- Step 2: Drop any existing unique constraint on the column
ALTER TABLE mandi.sales
    DROP CONSTRAINT IF EXISTS sales_idempotency_key_key;
ALTER TABLE mandi.sales
    DROP CONSTRAINT IF EXISTS sales_idempotency_key_unique;

-- Step 3: Change column type UUID → TEXT (safe: all existing values are UUID strings)
ALTER TABLE mandi.sales
    ALTER COLUMN idempotency_key TYPE TEXT USING idempotency_key::TEXT;

-- Step 4: Re-add unique constraint (same behavior, now on TEXT column)
ALTER TABLE mandi.sales
    ADD CONSTRAINT sales_idempotency_key_unique UNIQUE (idempotency_key);

-- Step 5: Recreate v_sales_fast exactly as before (same columns, same order)
CREATE VIEW mandi.v_sales_fast AS
 SELECT id,
    organization_id,
    buyer_id,
    sale_date,
    total_amount,
    status,
    payment_mode,
    bill_no,
    market_fee,
    nirashrit,
    misc_fee,
    loading_charges,
    unloading_charges,
    other_expenses,
    payment_status,
    created_at,
    idempotency_key,
    due_date,
    cheque_no,
    cheque_date,
    is_cheque_cleared,
    total_amount_inc_tax,
    buyer_gstin,
    cgst_amount,
    sgst_amount,
    igst_amount,
    gst_total,
    is_igst,
    place_of_supply,
    workflow_status,
    is_adjusted,
    bank_name,
    contact_bill_no,
    discount_percent,
    discount_amount,
    amount_received,
    bank_account_id,
    cheque_status,
    updated_at,
    narration,
    subtotal,
    balance_due,
    paid_amount,
    invoice_no,
    gst_enabled
   FROM mandi.sales;

-- Step 6: Verify fix
DO $$
DECLARE
    v_col_type TEXT;
BEGIN
    SELECT data_type INTO v_col_type
    FROM information_schema.columns
    WHERE table_schema = 'mandi' AND table_name = 'sales' AND column_name = 'idempotency_key';
    
    IF v_col_type = 'text' THEN
        RAISE NOTICE 'SUCCESS: idempotency_key is now TEXT — uuid=text error resolved in confirm_sale_transaction';
    ELSE
        RAISE EXCEPTION 'FAILED: idempotency_key is still %, expected text', v_col_type;
    END IF;
END $$;
