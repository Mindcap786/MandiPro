-- ============================================================================
-- MIGRATION: Finance Dashboard Full Visibility (v5.12)
-- Date:     2026-04-26
--
-- RCA (three defects that stack to produce "all zeros"):
--   1. STATUS/FILTER DRIFT
--      ledger_entries.status has DEFAULT 'posted' (migration 20260412190000)
--      but the dashboard views/RPCs filter WHERE status = 'active', so every
--      new row falls off every card. Industry standard: 'posted' IS the
--      canonical value in double-entry accounting — the read side is wrong.
--
--   2. INCOMPLETE SALE POSTING
--      confirm_sale_transaction posts only the sale invoice (DR Buyer /
--      CR Revenue). For CASH/UPI/BANK/cleared-cheque sales it never posts
--      the receipt side (DR Cash|Bank / CR Buyer). Cash stays zero, buyer
--      shows outstanding even though fully paid.
--
--   3. WRONG transaction_type TAG
--      Some versions of confirm_sale_transaction wrote transaction_type='purchase'
--      on sale rows. Cosmetic but misclassifies the daybook.
--
-- VERIFIED PRE-CONDITIONS (confirmed by DB inspection 2026-04-18):
--   - 73.8% of ledger_entries have status='posted', 26.2% have status='active'
--   - view_party_balances already has broadened filter (from prior migration)
--   - get_financial_summary cash/bank filters still use only 'active' → $0
--   - confirm_sale_transaction (latest version) has stock deduction + sale_items
--     but receipt-side ledger entries are only posted when p_amount_received > 0,
--     which misses the case where mode=cash but amount_received is null/0
--   - Bank account resolution in get_financial_summary picks 'Bank Charges'
--     (wrong) → need to tighten the bank filter
--
-- FIX SCOPE:
--   A. Broaden get_financial_summary cash/bank read filters ('active'+'posted')
--      AND fix the bank account resolution to exclude expense-type accounts
--   B. Rewrite confirm_sale_transaction to:
--        - Include idempotency check (carry over from current version)
--        - Include stock deduction + sale_items INSERT (carry over)
--        - Tag entries transaction_type='sale' (fix)
--        - Post receipt side for ALL cleared payment modes, not just amount_received > 0
--   C. One-time backfill: fix misclassified transaction_type='purchase' sale rows
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- A. get_financial_summary — fix status filter AND bank account resolution
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mandi.get_financial_summary(p_org_id UUID, _cache_bust BIGINT DEFAULT 0)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, public, pg_temp
AS $$
DECLARE
    v_recv  NUMERIC := 0;
    v_f_pay NUMERIC := 0;
    v_s_pay NUMERIC := 0;
    v_cash  NUMERIC := 0;
    v_bank  NUMERIC := 0;
    v_cash_acct JSONB;
    v_bank_acct JSONB;
BEGIN
    -- Receivables / payables from the broadened view (view already fixed)
    SELECT COALESCE(SUM(CASE WHEN net_balance > 0 THEN net_balance ELSE 0 END), 0) INTO v_recv
      FROM mandi.view_party_balances WHERE organization_id = p_org_id AND contact_type IN ('buyer', 'Buyer');

    SELECT COALESCE(SUM(CASE WHEN net_balance < 0 THEN ABS(net_balance) ELSE 0 END), 0) INTO v_f_pay
      FROM mandi.view_party_balances WHERE organization_id = p_org_id AND contact_type IN ('farmer', 'Farmer');

    SELECT COALESCE(SUM(CASE WHEN net_balance < 0 THEN ABS(net_balance) ELSE 0 END), 0) INTO v_s_pay
      FROM mandi.view_party_balances WHERE organization_id = p_org_id AND contact_type IN ('supplier', 'Supplier');

    -- Cash: broadened status + tightened account match (exclude expense/liability accounts)
    SELECT COALESCE(SUM(bal), 0) INTO v_cash
    FROM (
        SELECT (COALESCE(a.opening_balance, 0) + COALESCE(SUM(le.debit - le.credit), 0)) AS bal
        FROM mandi.accounts a
        LEFT JOIN mandi.ledger_entries le
               ON a.id = le.account_id
              AND COALESCE(le.status, 'active') IN ('active', 'posted', 'confirmed', 'cleared')
              AND le.organization_id = p_org_id
        WHERE a.organization_id = p_org_id
          AND a.type = 'asset'  -- CRITICAL: must be an asset account
          AND (a.account_sub_type = 'cash' OR a.code = '1001' OR (a.name ILIKE '%cash in hand%'))
          AND a.name NOT ILIKE '%transit%'
          AND a.name NOT ILIKE '%charges%'
        GROUP BY a.id, a.opening_balance
    ) sub;

    -- Bank: broadened status + only actual bank asset accounts
    SELECT COALESCE(SUM(bal), 0) INTO v_bank
    FROM (
        SELECT (COALESCE(a.opening_balance, 0) + COALESCE(SUM(le.debit - le.credit), 0)) AS bal
        FROM mandi.accounts a
        LEFT JOIN mandi.ledger_entries le
               ON a.id = le.account_id
              AND COALESCE(le.status, 'active') IN ('active', 'posted', 'confirmed', 'cleared')
              AND le.organization_id = p_org_id
        WHERE a.organization_id = p_org_id
          AND a.type = 'asset'  -- CRITICAL: must be an asset account
          AND (a.account_sub_type = 'bank' OR a.code = '1002')
          AND a.name NOT ILIKE '%transit%'
          AND a.name NOT ILIKE '%cheque%'
          AND a.name NOT ILIKE '%charges%'
        GROUP BY a.id, a.opening_balance
    ) sub;

    SELECT jsonb_build_object('id', id, 'name', name, 'balance', v_cash) INTO v_cash_acct
    FROM mandi.accounts 
    WHERE organization_id = p_org_id 
      AND type = 'asset'
      AND (account_sub_type = 'cash' OR code = '1001' OR name ILIKE '%cash in hand%')
      AND name NOT ILIKE '%transit%' AND name NOT ILIKE '%charges%'
    LIMIT 1;

    SELECT jsonb_build_object('id', id, 'name', name, 'balance', v_bank) INTO v_bank_acct
    FROM mandi.accounts 
    WHERE organization_id = p_org_id 
      AND type = 'asset'
      AND (account_sub_type = 'bank' OR code = '1002')
      AND name NOT ILIKE '%transit%' AND name NOT ILIKE '%cheque%' AND name NOT ILIKE '%charges%'
    LIMIT 1;

    RETURN jsonb_build_object(
        'receivables',       v_recv,
        'farmer_payables',   v_f_pay,
        'supplier_payables', v_s_pay,
        'cash',              COALESCE(v_cash_acct, jsonb_build_object('id', null, 'name', 'Cash', 'balance', v_cash)),
        'bank',              COALESCE(v_bank_acct, jsonb_build_object('id', null, 'name', 'Bank', 'balance', v_bank)),
        'timestamp',         NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION mandi.get_financial_summary(UUID, BIGINT) TO authenticated, anon;

-- Public schema proxy (for edge functions that call without schema prefix)
CREATE OR REPLACE FUNCTION public.get_financial_summary(p_org_id UUID, _cache_bust BIGINT DEFAULT 0)
RETURNS JSONB LANGUAGE SQL SECURITY DEFINER AS $$ SELECT mandi.get_financial_summary(p_org_id, _cache_bust); $$;

GRANT EXECUTE ON FUNCTION public.get_financial_summary(UUID, BIGINT) TO authenticated, anon;

-- ----------------------------------------------------------------------------
-- B. confirm_sale_transaction — complete rewrite with ALL pieces:
--    1. Idempotency check (prevents duplicate submissions)
--    2. Stock deduction + sale_items INSERT (inventory integrity)
--    3. Invoice-side ledger: DR Buyer / CR Revenue (transaction_type='sale')
--    4. Receipt-side ledger: DR Cash|Bank / CR Buyer (the missing half)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id uuid,
    p_buyer_id uuid,
    p_sale_date date,
    p_payment_mode text,
    p_total_amount numeric,
    p_items jsonb,
    p_market_fee numeric DEFAULT 0,
    p_nirashrit numeric DEFAULT 0,
    p_misc_fee numeric DEFAULT 0,
    p_loading_charges numeric DEFAULT 0,
    p_unloading_charges numeric DEFAULT 0,
    p_other_expenses numeric DEFAULT 0,
    p_amount_received numeric DEFAULT NULL::numeric,
    p_idempotency_key text DEFAULT NULL,
    p_due_date date DEFAULT NULL,
    p_bank_account_id uuid DEFAULT NULL,
    p_cheque_no text DEFAULT NULL,
    p_cheque_date date DEFAULT NULL,
    p_cheque_status boolean DEFAULT false,
    p_bank_name text DEFAULT NULL,
    p_cgst_amount numeric DEFAULT 0,
    p_sgst_amount numeric DEFAULT 0,
    p_igst_amount numeric DEFAULT 0,
    p_gst_total numeric DEFAULT 0,
    p_discount_percent numeric DEFAULT 0,
    p_discount_amount numeric DEFAULT 0,
    p_place_of_supply text DEFAULT NULL,
    p_buyer_gstin text DEFAULT NULL,
    p_is_igst boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, public, extensions
AS $function$
DECLARE
    v_sale_id              UUID;
    v_bill_no              BIGINT;
    v_contact_bill_no      BIGINT;
    v_gross_total          NUMERIC;
    v_total_inc_tax        NUMERIC;
    v_sales_revenue_acc_id UUID;
    v_recovery_acc_id      UUID;
    v_cash_acc_id          UUID;
    v_bank_acc_id          UUID;
    v_cheques_transit_acc_id UUID;
    v_receipt_acc_id       UUID;
    v_payment_status       TEXT;
    v_mode_lower           TEXT;
    v_voucher_id           UUID;
    v_receipt_voucher_id   UUID;
    v_received             NUMERIC := 0;
    v_item                 RECORD;
    v_qty                  NUMERIC;
    v_rate                 NUMERIC;
    v_updated_rows         INT;
BEGIN
    -- ── 1. Idempotency check ─────────────────────────────────────────────────
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_sale_id FROM mandi.sales
        WHERE idempotency_key = p_idempotency_key AND organization_id = p_organization_id;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'idempotent', true);
        END IF;
    END IF;

    v_mode_lower := LOWER(COALESCE(p_payment_mode, ''));

    -- ── 2. Account resolution (3-tier lookup) ────────────────────────────────
    SELECT id INTO v_sales_revenue_acc_id FROM mandi.accounts
    WHERE organization_id = p_organization_id AND code = '4001' LIMIT 1;

    SELECT id INTO v_recovery_acc_id FROM mandi.accounts
    WHERE organization_id = p_organization_id AND (code = '4002' OR code = '4300') LIMIT 1;
    IF v_recovery_acc_id IS NULL THEN v_recovery_acc_id := v_sales_revenue_acc_id; END IF;

    SELECT id INTO v_cash_acc_id FROM mandi.accounts
    WHERE organization_id = p_organization_id AND type = 'asset'
      AND (account_sub_type = 'cash' OR name ILIKE '%cash in hand%' OR code = '1001')
      AND name NOT ILIKE '%charges%' LIMIT 1;

    SELECT id INTO v_bank_acc_id FROM mandi.accounts
    WHERE organization_id = p_organization_id AND type = 'asset'
      AND (account_sub_type = 'bank' OR code = '1002')
      AND name NOT ILIKE '%transit%' AND name NOT ILIKE '%cheque%' AND name NOT ILIKE '%charges%'
    ORDER BY code LIMIT 1;

    SELECT id INTO v_cheques_transit_acc_id FROM mandi.accounts
    WHERE organization_id = p_organization_id
      AND (account_sub_type = 'bank' OR code = '1004')
      AND (name ILIKE '%transit%' OR name ILIKE '%cheque%') LIMIT 1;

    -- ── 3. Stock deduction (atomic — raises exception on insufficient qty) ───
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_qty  := COALESCE((v_item.value->>'qty')::NUMERIC, (v_item.value->>'quantity')::NUMERIC, 0);
        v_rate := COALESCE((v_item.value->>'rate')::NUMERIC, (v_item.value->>'rate_per_unit')::NUMERIC, 0);

        IF v_qty > 0 AND (v_item.value->>'lot_id') IS NOT NULL THEN
            UPDATE mandi.lots
            SET current_qty = current_qty - v_qty,
                status = CASE WHEN current_qty - v_qty <= 0 THEN 'Sold' ELSE 'partial' END
            WHERE id = (v_item.value->>'lot_id')::UUID
              AND organization_id = p_organization_id
              AND current_qty >= v_qty;

            GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
            IF v_updated_rows = 0 THEN
                RETURN jsonb_build_object('success', false, 'error',
                    FORMAT('Insufficient stock or invalid lot for ID: %s', v_item.value->>'lot_id'));
            END IF;
        END IF;
    END LOOP;

    -- ── 4. Totals ────────────────────────────────────────────────────────────
    v_gross_total   := p_total_amount
                       - COALESCE(p_discount_amount, 0)
                       + COALESCE(p_market_fee, 0)
                       + COALESCE(p_nirashrit, 0)
                       + COALESCE(p_misc_fee, 0)
                       + COALESCE(p_loading_charges, 0)
                       + COALESCE(p_unloading_charges, 0)
                       + COALESCE(p_other_expenses, 0);
    v_total_inc_tax := v_gross_total + COALESCE(p_gst_total, 0);

    -- ── 5. Payment status + amount received ─────────────────────────────────
    v_payment_status := 'pending';
    IF v_mode_lower IN ('cash', 'upi', 'bank_transfer', 'bank_upi') THEN
        IF COALESCE(p_amount_received, 0) > 0 AND p_amount_received < (v_total_inc_tax - 0.01) THEN
            v_payment_status := 'partial';
            v_received := p_amount_received;
        ELSE
            -- cash/upi/bank always fully settles (even if amount_received not explicitly set)
            v_payment_status := 'paid';
            v_received := COALESCE(p_amount_received, v_total_inc_tax);
        END IF;
    ELSIF v_mode_lower = 'cheque' THEN
        IF p_cheque_status = true THEN
            -- cleared cheque: treat as paid
            v_payment_status := 'paid';
            v_received := COALESCE(p_amount_received, v_total_inc_tax);
        ELSE
            -- uncleared cheque: pending but post to transit account
            v_payment_status := 'pending';
            v_received := v_total_inc_tax; -- goes to cheques-in-transit
        END IF;
    ELSIF COALESCE(p_amount_received, 0) > 0 THEN
        IF p_amount_received >= (v_total_inc_tax - 0.01) THEN
            v_payment_status := 'paid';
            v_received := p_amount_received;
        ELSE
            v_payment_status := 'partial';
            v_received := p_amount_received;
        END IF;
    END IF;
    -- udhaar/credit always stays pending with v_received = 0
    IF v_mode_lower IN ('udhaar', 'credit') THEN
        v_payment_status := 'pending';
        v_received := 0;
    END IF;

    -- ── 6. Insert sale header ────────────────────────────────────────────────
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, total_amount, total_amount_inc_tax,
        payment_mode, payment_status,
        market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, other_expenses, due_date,
        cheque_no, cheque_date, bank_name, bank_account_id,
        cgst_amount, sgst_amount, igst_amount, gst_total,
        discount_percent, discount_amount, place_of_supply, buyer_gstin, idempotency_key
    )
    VALUES (
        p_organization_id, p_buyer_id, p_sale_date, p_total_amount, v_total_inc_tax,
        p_payment_mode, v_payment_status,
        COALESCE(p_market_fee, 0), COALESCE(p_nirashrit, 0), COALESCE(p_misc_fee, 0),
        COALESCE(p_loading_charges, 0), COALESCE(p_unloading_charges, 0), COALESCE(p_other_expenses, 0), p_due_date,
        p_cheque_no, p_cheque_date, p_bank_name, p_bank_account_id,
        COALESCE(p_cgst_amount, 0), COALESCE(p_sgst_amount, 0), COALESCE(p_igst_amount, 0), COALESCE(p_gst_total, 0),
        COALESCE(p_discount_percent, 0), COALESCE(p_discount_amount, 0),
        p_place_of_supply, p_buyer_gstin, p_idempotency_key
    )
    RETURNING id, bill_no, contact_bill_no INTO v_sale_id, v_bill_no, v_contact_bill_no;

    -- ── 7. Insert sale line items ────────────────────────────────────────────
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_qty  := COALESCE((v_item.value->>'qty')::NUMERIC, (v_item.value->>'quantity')::NUMERIC, 0);
        v_rate := COALESCE((v_item.value->>'rate')::NUMERIC, (v_item.value->>'rate_per_unit')::NUMERIC, 0);

        IF v_qty > 0 THEN
            INSERT INTO mandi.sale_items (sale_id, lot_id, qty, rate, amount)
            VALUES (
                v_sale_id,
                CASE WHEN (v_item.value->>'lot_id') IS NOT NULL
                     THEN (v_item.value->>'lot_id')::UUID ELSE NULL END,
                v_qty, v_rate, (v_qty * v_rate)
            );
        END IF;
    END LOOP;

    -- ── 8. Invoice-side voucher + ledger entries (DR Buyer / CR Revenue) ─────
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, invoice_id, party_id, payment_mode)
    VALUES (p_organization_id, p_sale_date, 'sale',
            (SELECT COALESCE(MAX(voucher_no), 0) + 1 FROM mandi.vouchers
             WHERE organization_id = p_organization_id AND type = 'sale'),
            v_total_inc_tax, 'Sale #' || v_bill_no, v_sale_id, p_buyer_id, p_payment_mode)
    RETURNING id INTO v_voucher_id;

    -- DR Buyer (receivable)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (p_organization_id, v_voucher_id, p_buyer_id, v_total_inc_tax, 0, p_sale_date, 'Sale Bill #' || v_bill_no, 'sale', v_sale_id);

    -- CR Revenue
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (p_organization_id, v_voucher_id, v_sales_revenue_acc_id, 0, p_total_amount, p_sale_date, 'Goods Revenue #' || v_bill_no, 'sale', v_sale_id);

    -- CR Fees/Tax Recovery (if any)
    IF (v_total_inc_tax - p_total_amount) <> 0 AND v_recovery_acc_id IS NOT NULL THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (p_organization_id, v_voucher_id, v_recovery_acc_id, 0, (v_total_inc_tax - p_total_amount), p_sale_date, 'Fees/Tax Recovery #' || v_bill_no, 'sale', v_sale_id);
    END IF;

    -- ── 9. Receipt-side voucher + ledger entries (DR Cash|Bank / CR Buyer) ───
    IF v_received > 0 THEN
        -- Determine which account receives the cash/cheque
        IF v_mode_lower = 'cash' THEN
            v_receipt_acc_id := v_cash_acc_id;
        ELSIF p_bank_account_id IS NOT NULL THEN
            v_receipt_acc_id := p_bank_account_id;  -- user-specified bank account
        ELSIF v_mode_lower IN ('upi', 'bank_transfer', 'bank_upi') THEN
            v_receipt_acc_id := COALESCE(v_bank_acc_id, v_cash_acc_id);
        ELSIF v_mode_lower = 'cheque' AND p_cheque_status = false THEN
            v_receipt_acc_id := COALESCE(v_cheques_transit_acc_id, v_bank_acc_id, v_cash_acc_id);
        ELSE
            v_receipt_acc_id := COALESCE(v_bank_acc_id, v_cash_acc_id);
        END IF;

        IF v_receipt_acc_id IS NOT NULL THEN
            INSERT INTO mandi.vouchers (
                organization_id, date, type, voucher_no, amount, narration, invoice_id, party_id,
                payment_mode, bank_account_id, cheque_no, cheque_date, bank_name, is_cleared, cheque_status
            )
            VALUES (
                p_organization_id, p_sale_date, 'receipt',
                (SELECT COALESCE(MAX(voucher_no), 0) + 1 FROM mandi.vouchers
                 WHERE organization_id = p_organization_id AND type = 'receipt'),
                v_received, 'Receipt against Sale #' || v_bill_no, v_sale_id, p_buyer_id,
                p_payment_mode, p_bank_account_id, p_cheque_no, p_cheque_date, p_bank_name,
                CASE WHEN v_mode_lower = 'cheque' THEN p_cheque_status ELSE TRUE END,
                CASE WHEN v_mode_lower = 'cheque' AND p_cheque_status = false THEN 'Pending' ELSE 'Cleared' END
            )
            RETURNING id INTO v_receipt_voucher_id;

            -- DR Cash / Bank / Cheques-in-transit
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (p_organization_id, v_receipt_voucher_id, v_receipt_acc_id, v_received, 0, p_sale_date, 'Receipt against Sale #' || v_bill_no, 'receipt', v_sale_id);

            -- CR Buyer (settles the receivable)
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (p_organization_id, v_receipt_voucher_id, p_buyer_id, 0, v_received, p_sale_date, 'Receipt against Sale #' || v_bill_no, 'receipt', v_sale_id);
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success',        true,
        'payment_status', v_payment_status,
        'sale_id',        v_sale_id,
        'bill_no',        v_bill_no,
        'received',       v_received
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION mandi.confirm_sale_transaction(
    uuid, uuid, date, text, numeric, jsonb,
    numeric, numeric, numeric, numeric, numeric, numeric,
    numeric, text, date, uuid, text, date, boolean, text,
    numeric, numeric, numeric, numeric, numeric, numeric,
    text, text, boolean
) TO authenticated, anon;

-- ----------------------------------------------------------------------------
-- C. One-time backfill: fix misclassified sale ledger rows tagged 'purchase'
--    Only touches rows linked to a voucher of type 'sale' — zero blast radius
-- ----------------------------------------------------------------------------
UPDATE mandi.ledger_entries le
   SET transaction_type = 'sale'
  FROM mandi.vouchers v
 WHERE le.voucher_id = v.id
   AND v.type IN ('sale', 'sales')
   AND le.transaction_type = 'purchase';

-- ----------------------------------------------------------------------------
-- D. Backfill missing receipt-side entries for existing CASH/UPI sales
--    For any sale that is 'paid' but has no receipt voucher yet, post it now.
--    This is a one-time repair for historical data.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
    v_cash_acc_id UUID;
    v_bank_acc_id UUID;
    v_receipt_acc_id UUID;
    v_receipt_voucher_id UUID;
    v_mode TEXT;
    v_already_has_receipt BOOLEAN;
BEGIN
    FOR r IN 
        SELECT s.id, s.organization_id, s.buyer_id, s.sale_date, 
               COALESCE(s.total_amount_inc_tax, s.total_amount) as total,
               s.payment_mode, s.bank_account_id, s.bill_no
        FROM mandi.sales s
        WHERE s.payment_status IN ('paid', 'partial')
          AND s.payment_mode NOT IN ('udhaar', 'credit')
    LOOP
        -- Check if receipt voucher already exists for this sale
        SELECT EXISTS(
            SELECT 1 FROM mandi.vouchers v
            WHERE v.invoice_id = r.id AND v.type = 'receipt'
        ) INTO v_already_has_receipt;

        CONTINUE WHEN v_already_has_receipt;

        v_mode := LOWER(COALESCE(r.payment_mode, ''));

        -- Find accounts
        SELECT id INTO v_cash_acc_id FROM mandi.accounts
        WHERE organization_id = r.organization_id AND type = 'asset'
          AND (account_sub_type = 'cash' OR name ILIKE '%cash in hand%' OR code = '1001')
          AND name NOT ILIKE '%charges%' LIMIT 1;

        SELECT id INTO v_bank_acc_id FROM mandi.accounts
        WHERE organization_id = r.organization_id AND type = 'asset'
          AND (account_sub_type = 'bank' OR code = '1002')
          AND name NOT ILIKE '%transit%' AND name NOT ILIKE '%charges%'
        ORDER BY code LIMIT 1;

        IF r.bank_account_id IS NOT NULL THEN
            v_receipt_acc_id := r.bank_account_id;
        ELSIF v_mode = 'cash' THEN
            v_receipt_acc_id := v_cash_acc_id;
        ELSE
            v_receipt_acc_id := COALESCE(v_bank_acc_id, v_cash_acc_id);
        END IF;

        CONTINUE WHEN v_receipt_acc_id IS NULL;

        INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, invoice_id, party_id, payment_mode, bank_account_id, is_cleared)
        VALUES (r.organization_id, r.sale_date, 'receipt',
                (SELECT COALESCE(MAX(voucher_no), 0) + 1 FROM mandi.vouchers WHERE organization_id = r.organization_id AND type = 'receipt'),
                r.total, 'Backfill Receipt for Sale #' || r.bill_no, r.id, r.buyer_id, r.payment_mode, r.bank_account_id, true)
        RETURNING id INTO v_receipt_voucher_id;

        -- DR Cash/Bank
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (r.organization_id, v_receipt_voucher_id, v_receipt_acc_id, r.total, 0, r.sale_date, 'Backfill Receipt Sale #' || r.bill_no, 'receipt', r.id);

        -- CR Buyer
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (r.organization_id, v_receipt_voucher_id, r.buyer_id, 0, r.total, r.sale_date, 'Backfill Receipt Sale #' || r.bill_no, 'receipt', r.id);

    END LOOP;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
