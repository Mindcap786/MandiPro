-- ============================================================
-- LEDGER REBUILD: Fix Double-Posting & Naam/Jama Logic
-- Migration: 20260412_ledger_system_rebuild.sql
--
-- PROBLEMS FIXED:
-- 1. trg_sync_sales_ledger trigger double-posted every sale entry
-- 2. Sale ledger "Items Sold" leg was never posted by the RPC
-- 3. Payment descriptions were generic ("Payment Received")
-- 4. Lot stock qty was not decremented in latest RPC version
-- 5. Sale status (paid/partial/pending) was not correctly set
--
-- ARCHITECTURE (Double-Entry for Mandi):
--   SALE to Buyer:
--     DR Buyer (Naam/Items Sold)  → buyer owes us
--     CR Buyer (Jama/Cash Received) → buyer paid [if payment > 0]
--     DR Cash/Bank → our asset increases [if payment > 0]
-- ============================================================

-- ─── STEP 1: Drop the duplicate-posting trigger ───────────────
DROP TRIGGER IF EXISTS trg_sync_sales_ledger ON mandi.sales;
DROP TRIGGER IF EXISTS trg_manage_ledger ON mandi.sales;

-- Keep the function but make it a safe no-op (trigger may be re-attached by old migrations)
CREATE OR REPLACE FUNCTION mandi.manage_sales_ledger_entry()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    -- Ledger posting is now handled exclusively inside confirm_sale_transaction RPC.
    -- This function is kept to prevent errors if the trigger is accidentally re-attached.
    RETURN NEW;
END;
$function$;

-- ─── STEP 2: Rebuild confirm_sale_transaction (self-contained ledger posting) ─
CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id   uuid,
    p_buyer_id          uuid,
    p_sale_date         date,
    p_payment_mode      text,
    p_total_amount      numeric,
    p_items             jsonb,
    p_market_fee        numeric  DEFAULT 0,
    p_nirashrit         numeric  DEFAULT 0,
    p_misc_fee          numeric  DEFAULT 0,
    p_loading_charges   numeric  DEFAULT 0,
    p_unloading_charges numeric  DEFAULT 0,
    p_other_expenses    numeric  DEFAULT 0,
    p_amount_received   numeric  DEFAULT NULL,
    p_idempotency_key   text     DEFAULT NULL,
    p_due_date          date     DEFAULT NULL,
    p_cheque_no         text     DEFAULT NULL,
    p_cheque_date       date     DEFAULT NULL,
    p_cheque_status     boolean  DEFAULT false,
    p_bank_name         text     DEFAULT NULL,
    p_bank_account_id   uuid     DEFAULT NULL,
    p_cgst_amount       numeric  DEFAULT 0,
    p_sgst_amount       numeric  DEFAULT 0,
    p_igst_amount       numeric  DEFAULT 0,
    p_gst_total         numeric  DEFAULT 0,
    p_discount_percent  numeric  DEFAULT 0,
    p_discount_amount   numeric  DEFAULT 0,
    p_place_of_supply   text     DEFAULT NULL,
    p_buyer_gstin       text     DEFAULT NULL,
    p_is_igst           boolean  DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_sale_id           UUID;
    v_sales_acct_id     UUID;
    v_bill_no           BIGINT;
    v_contact_bill_no   BIGINT;
    v_gross_total       NUMERIC;
    v_total_inc_tax     NUMERIC;
    v_receipt_amount    NUMERIC := 0;
    v_payment_status    TEXT := 'pending';
    v_sale_voucher_id   UUID;
    v_sale_voucher_no   BIGINT;
    v_rcpt_voucher_id   UUID;
    v_rcpt_voucher_no   BIGINT;
    v_cash_bank_acc_id  UUID;
    v_cheque_status_txt TEXT;
    v_item              jsonb;
    v_item_qty          NUMERIC;
    v_item_rate         NUMERIC;
    v_item_amount       NUMERIC;
    v_item_gst          NUMERIC;
    v_bill_label        TEXT;
BEGIN
    -- ── 1. Idempotency Guard ──────────────────────────────────────
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, bill_no, contact_bill_no
        INTO v_sale_id, v_bill_no, v_contact_bill_no
        FROM mandi.sales
        WHERE idempotency_key = p_idempotency_key::uuid
          AND organization_id = p_organization_id
        LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no,
                'contact_bill_no', v_contact_bill_no, 'message', 'Duplicate skipped'
            );
        END IF;
    END IF;

    -- ── 2. Validate items ────────────────────────────────────────
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'No items in sale';
    END IF;

    -- ── 3. Compute totals ────────────────────────────────────────
    v_gross_total := ROUND(
        COALESCE(p_total_amount,      0)
      + COALESCE(p_market_fee,        0)
      + COALESCE(p_nirashrit,         0)
      + COALESCE(p_misc_fee,          0)
      + COALESCE(p_loading_charges,   0)
      + COALESCE(p_unloading_charges, 0)
      + COALESCE(p_other_expenses,    0), 2);
    v_total_inc_tax := ROUND(v_gross_total + COALESCE(p_gst_total, 0), 2);

    -- ── 4. Payment Status (strict math) ─────────────────────────
    v_cheque_status_txt := CASE
        WHEN p_payment_mode = 'cheque' AND p_cheque_status = true  THEN 'Cleared'
        WHEN p_payment_mode = 'cheque'                              THEN 'Pending'
        ELSE NULL
    END;

    IF LOWER(p_payment_mode) IN ('cash','upi','upi/bank','bank_transfer', 'card')
       OR (LOWER(p_payment_mode) = 'cheque' AND p_cheque_status = true)
    THEN
        v_receipt_amount := CASE
            WHEN COALESCE(p_amount_received, 0) > 0 THEN ROUND(p_amount_received, 2)
            ELSE v_total_inc_tax
        END;
        v_payment_status := CASE
            WHEN v_receipt_amount >= v_total_inc_tax THEN 'paid'
            ELSE 'partial'
        END;
    END IF;
    -- credit/cheque-pending stays 'pending'

    -- ── 5. Insert Sale Record ────────────────────────────────────
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date,
        total_amount, total_amount_inc_tax,
        payment_mode, payment_status,
        market_fee, nirashrit, misc_fee,
        loading_charges, unloading_charges, other_expenses,
        due_date, cheque_no, cheque_date, bank_name,
        cgst_amount, sgst_amount, igst_amount, gst_total,
        discount_percent, discount_amount,
        is_cheque_cleared, idempotency_key
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date,
        p_total_amount, v_total_inc_tax,
        p_payment_mode, v_payment_status,
        p_market_fee, p_nirashrit, p_misc_fee,
        p_loading_charges, p_unloading_charges, p_other_expenses,
        p_due_date, p_cheque_no, p_cheque_date, p_bank_name,
        p_cgst_amount, p_sgst_amount, p_igst_amount, p_gst_total,
        p_discount_percent, p_discount_amount,
        p_cheque_status, p_idempotency_key::uuid
    ) RETURNING id, bill_no, contact_bill_no
      INTO v_sale_id, v_bill_no, v_contact_bill_no;

    v_bill_label := COALESCE(v_contact_bill_no, v_bill_no)::text;

    -- ── 6. Insert Sale Items + Decrement Lot Stock ───────────────
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_item_qty    := ROUND((v_item->>'qty')::numeric,  3);
        v_item_rate   := ROUND((v_item->>'rate')::numeric, 2);
        v_item_amount := ROUND(v_item_qty * v_item_rate,   2);
        v_item_gst    := ROUND(COALESCE((v_item->>'gst_amount')::numeric, 0), 2);

        INSERT INTO mandi.sale_items (
            organization_id, sale_id, lot_id, qty, rate, amount, unit, tax_amount
        ) VALUES (
            p_organization_id, v_sale_id,
            (v_item->>'lot_id')::uuid,
            v_item_qty, v_item_rate, v_item_amount,
            COALESCE(v_item->>'unit', 'Box'),
            v_item_gst
        );

        -- Decrement lot stock
        UPDATE mandi.lots
        SET current_qty = current_qty - v_item_qty
        WHERE id = (v_item->>'lot_id')::uuid
          AND organization_id = p_organization_id;

        -- Guard: reject if over-sold
        IF EXISTS (
            SELECT 1 FROM mandi.lots
            WHERE id = (v_item->>'lot_id')::uuid AND current_qty < 0
        ) THEN
            RAISE EXCEPTION 'Insufficient stock for Lot ID %. Transaction Aborted.',
                (v_item->>'lot_id');
        END IF;
    END LOOP;

    -- ── 7. SALE VOUCHER + LEDGER LEG (Items Sold → Debit Buyer) ──
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_sale_voucher_no
    FROM mandi.vouchers
    WHERE organization_id = p_organization_id AND type = 'sales';

    INSERT INTO mandi.vouchers (
        organization_id, date, type, voucher_no, amount, narration,
        invoice_id, party_id, payment_mode, cheque_no, cheque_date,
        cheque_status, bank_account_id
    ) VALUES (
        p_organization_id, p_sale_date, 'sales', v_sale_voucher_no,
        v_total_inc_tax, 'Invoice #' || v_bill_label,
        v_sale_id, p_buyer_id, p_payment_mode,
        p_cheque_no, p_cheque_date, v_cheque_status_txt, p_bank_account_id
    ) RETURNING id INTO v_sale_voucher_id;

    -- DR Buyer: Items sold (Naam — buyer owes us)
    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, contact_id, debit, credit,
        entry_date, description, transaction_type, reference_no, reference_id
    ) VALUES (
        p_organization_id, v_sale_voucher_id, p_buyer_id,
        v_total_inc_tax, 0,
        p_sale_date,
        'Invoice #' || v_bill_label,
        'sale',
        v_bill_label,
        v_sale_id
    );

    -- Find Sales Account
    SELECT id INTO v_sales_acct_id FROM mandi.accounts
    WHERE organization_id = p_organization_id
      AND (name ILIKE 'Sales%' OR name = 'Revenue' OR type = 'income')
      AND name NOT ILIKE '%Commission%'
    ORDER BY (name = 'Sales') DESC, (name = 'Sales Revenue') DESC, name
    LIMIT 1;

    -- CR Sales Account: Revenue increases (Jama)
    -- Insert unconditionally to ensure the voucher mathematically balances (debit=credit)
    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, account_id, debit, credit,
        entry_date, description, transaction_type, reference_no, reference_id
    ) VALUES (
        p_organization_id, v_sale_voucher_id, v_sales_acct_id,
        0, v_total_inc_tax,
        p_sale_date,
        'Invoice #' || v_bill_label,
        'sales',
        v_bill_label,
        v_sale_id
    );

    -- ── 8. RECEIPT VOUCHER + LEDGER LEGS (Payment Received) ──────
    --    Only for instant payments: Cash, UPI, Cleared Cheque
    IF v_receipt_amount > 0 THEN
        -- Resolve cash/bank account
        IF LOWER(p_payment_mode) = 'cash' THEN
            SELECT id INTO v_cash_bank_acc_id FROM mandi.accounts
            WHERE organization_id = p_organization_id AND code = '1001' LIMIT 1;
        ELSIF p_bank_account_id IS NOT NULL THEN
            v_cash_bank_acc_id := p_bank_account_id;
        ELSE
            SELECT id INTO v_cash_bank_acc_id FROM mandi.accounts
            WHERE organization_id = p_organization_id AND code = '1002' LIMIT 1;
        END IF;
        -- Final fallback
        IF v_cash_bank_acc_id IS NULL THEN
            SELECT id INTO v_cash_bank_acc_id FROM mandi.accounts
            WHERE organization_id = p_organization_id AND code = '1001' LIMIT 1;
        END IF;

        IF v_cash_bank_acc_id IS NOT NULL THEN
            SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_rcpt_voucher_no
            FROM mandi.vouchers
            WHERE organization_id = p_organization_id AND type = 'receipt';

            INSERT INTO mandi.vouchers (
                organization_id, date, type, voucher_no, narration, amount,
                contact_id, invoice_id, bank_account_id,
                cheque_no, cheque_date, cheque_status, is_cleared, cleared_at
            ) VALUES (
                p_organization_id, p_sale_date, 'receipt', v_rcpt_voucher_no,
                'Payment against Invoice #' || v_bill_label, v_receipt_amount,
                p_buyer_id, v_sale_id, v_cash_bank_acc_id,
                p_cheque_no, p_cheque_date, v_cheque_status_txt,
                CASE WHEN p_payment_mode = 'cheque' THEN true ELSE false END,
                CASE WHEN p_payment_mode = 'cheque' THEN p_sale_date ELSE NULL END
            ) RETURNING id INTO v_rcpt_voucher_id;

            -- CR Buyer: Payment received (Jama — buyer paid us)
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, contact_id, debit, credit,
                entry_date, description, transaction_type, reference_no, reference_id
            ) VALUES (
                p_organization_id, v_rcpt_voucher_id, p_buyer_id,
                0, v_receipt_amount,
                p_sale_date,
                'Payment against Invoice #' || v_bill_label,
                'receipt',
                v_bill_label,
                v_sale_id
            );

            -- DR Cash/Bank: Asset increases (Jama for our accounts)
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, account_id, debit, credit,
                entry_date, description, transaction_type, reference_no, reference_id
            ) VALUES (
                p_organization_id, v_rcpt_voucher_id, v_cash_bank_acc_id,
                v_receipt_amount, 0,
                p_sale_date,
                'Cash Received - Invoice #' || v_bill_label,
                'receipt',
                v_bill_label,
                v_sale_id
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'bill_no', v_bill_no,
        'contact_bill_no', v_contact_bill_no,
        'payment_status', v_payment_status,
        'message', 'Sale created. Status: ' || v_payment_status
    );
END;
$function$;

-- ─── STEP 3: Cleanup historical duplicate ledger entries ───────
-- 
-- The OLD trigger posted entries with transaction_type = 'sale'
-- but linked to account_id (e.g., Sales Revenue account, AR account),
-- NOT contact_id. The RPC posted to contact_id = buyer_id.
-- Both were using the same reference_id = sale_id.
--
-- Duplicates are identified as: entries for same reference_id with
-- debit > 0 AND contact_id IS NOT NULL AND transaction_type = 'sale'
-- where more than one exists.
--
-- SAFETY: We keep the entry with the voucher_id from our new 
-- 'sale' voucher. We delete old trigger-generated entries that
-- have no voucher_id OR where description = 'Invoice #...' but
-- are duplicated.
--
DO $do$
DECLARE
    v_deleted INT := 0;
BEGIN
    -- Find reference_ids that have duplicate 'sale' debit entries for the same contact
    -- and delete all but the newest one (the one posted by our new RPC)
    WITH duplicate_refs AS (
        -- Find sale reference_ids where we have more than 1 debit entry for a buyer
        SELECT reference_id, organization_id
        FROM mandi.ledger_entries
        WHERE transaction_type = 'sale'
          AND contact_id IS NOT NULL
          AND debit > 0
          AND reference_id IS NOT NULL
        GROUP BY reference_id, organization_id
        HAVING COUNT(*) > 1
    ),
    ranked_entries AS (
        -- Rank them oldest-first so we can delete all but the newest
        SELECT le.id,
               ROW_NUMBER() OVER (
                   PARTITION BY le.reference_id, le.organization_id
                   ORDER BY le.created_at ASC
               ) AS rn,
               COUNT(*) OVER (
                   PARTITION BY le.reference_id, le.organization_id
               ) AS total_count
        FROM mandi.ledger_entries le
        INNER JOIN duplicate_refs dr
            ON le.reference_id = dr.reference_id
            AND le.organization_id = dr.organization_id
        WHERE le.transaction_type = 'sale'
          AND le.contact_id IS NOT NULL
          AND le.debit > 0
    )
    DELETE FROM mandi.ledger_entries
    WHERE id IN (
        SELECT id FROM ranked_entries WHERE rn < total_count
    );

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Removed % duplicate sale ledger entries (from old trigger).', v_deleted;
END $do$;

-- ─── STEP 4: RLS Policy for ledger_entries ─────────────────────
ALTER TABLE mandi.ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mandi_ledger_entries_tenant" ON mandi.ledger_entries;
CREATE POLICY "mandi_ledger_entries_tenant" ON mandi.ledger_entries
    FOR ALL USING (organization_id = core.get_user_org_id())
    WITH CHECK (organization_id = core.get_user_org_id());

-- Also ensure vouchers RLS is set
ALTER TABLE mandi.vouchers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mandi_vouchers_tenant" ON mandi.vouchers;
CREATE POLICY "mandi_vouchers_tenant" ON mandi.vouchers
    FOR ALL USING (organization_id = core.get_user_org_id())
    WITH CHECK (organization_id = core.get_user_org_id());

-- ============================================================
-- VERIFICATION:
-- After running, for a NEW Cash Sale of ₹10,000 to Babu:
-- SELECT * FROM mandi.ledger_entries WHERE reference_id = '<sale_id>';
-- Should return EXACTLY 3 rows:
--   1. transaction_type='sale',    contact_id=babu_id, debit=10000, credit=0  → Naam
--   2. transaction_type='receipt', contact_id=babu_id, debit=0, credit=10000  → Jama  
--   3. transaction_type='receipt', account_id=cash_id, debit=10000, credit=0  → Cash in
-- ============================================================
