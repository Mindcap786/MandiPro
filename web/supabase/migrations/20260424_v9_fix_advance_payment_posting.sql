-- =============================================================================
-- Migration V9: Fix advance payment posting in post_arrival_ledger
--
-- ROOT CAUSE:
--   When an arrival was created with advance_amount > 0 and advance_payment_mode
--   in ('cash','bank','upi'), the payment was stored on the arrivals row but
--   NEVER converted into ledger entries.
--   The trigger trg_post_lot_advance_ledger only fires on UPDATE of mandi.lots.
--   In create_mixed_arrival, the lot's advance is set during INSERT, not UPDATE,
--   so the trigger condition (NEW.advance > OLD.advance) was never TRUE.
--   Result: All Arrivals / Quick Purchase showed "Full Udhaar" regardless of payment.
--
-- FIX:
--   post_arrival_ledger now also posts the advance payment as proper double-entry:
--     Dr Accounts Payable (reducing what mandi owes the farmer)
--     Cr Cash / Bank Account (money going out of mandi)
--
-- BUSINESS RULES ENFORCED:
--   - advance > 0 + mode = cash/bank/upi  → PAID / PARTIAL (correct)
--   - advance = 0                          → UDHAAR (correct)
--   - Mandi Commission sessions            → advance=0 always, so UDHAAR (correct)
--   - Cheque mode                          → posted separately on cheque clearing
-- =============================================================================

-- Helper function (called by post_arrival_ledger)
CREATE OR REPLACE FUNCTION mandi.post_arrival_advance_payment(
    p_arrival_id uuid,
    p_organization_id uuid,
    p_party_id uuid,
    p_advance_amount numeric,
    p_payment_mode text,
    p_bill_no bigint,
    p_created_at timestamptz,
    p_ap_acc_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
    v_cash_acc_id      UUID;
    v_payment_vch_id   UUID;
    v_pay_narration    TEXT;
BEGIN
    -- Idempotency: skip if already posted
    IF EXISTS (SELECT 1 FROM mandi.vouchers WHERE arrival_id = p_arrival_id AND type = 'payment') THEN
        RETURN;
    END IF;

    -- Lookup cash/bank account
    IF p_payment_mode = 'cash' THEN
        v_cash_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = p_organization_id AND account_sub_type = 'cash' LIMIT 1);
    ELSE
        v_cash_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = p_organization_id AND account_sub_type = 'bank' LIMIT 1);
    END IF;
    -- Fallback: any cash-named asset
    IF v_cash_acc_id IS NULL THEN
        v_cash_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = p_organization_id AND type = 'asset' AND name ILIKE '%cash%' LIMIT 1);
    END IF;

    IF v_cash_acc_id IS NULL OR p_ap_acc_id IS NULL THEN RETURN; END IF;

    v_pay_narration := 'Advance Paid - Bill #' || COALESCE(p_bill_no::text, '-') || ' (' || p_payment_mode || ')';

    -- Payment voucher (links to same arrival_id for Day Book grouping)
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, arrival_id, payment_mode)
    VALUES (
        p_organization_id, p_created_at, 'payment',
        (SELECT COALESCE(MAX(voucher_no),0)+1 FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'payment'),
        p_advance_amount, v_pay_narration, p_arrival_id, p_payment_mode
    ) RETURNING id INTO v_payment_vch_id;

    -- Dr Accounts Payable (reducing liability to farmer/supplier)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (p_organization_id, v_payment_vch_id, p_ap_acc_id, p_party_id,
            p_advance_amount, 0, p_created_at, v_pay_narration, 'purchase_payment', p_arrival_id);

    -- Cr Cash/Bank (cash going out of mandi's pocket)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (p_organization_id, v_payment_vch_id, v_cash_acc_id, NULL,
            0, p_advance_amount, p_created_at, v_pay_narration, 'purchase_payment', p_arrival_id);
END;
$fn$;


-- Main function (updated with idempotent two-part posting)
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_arrival          RECORD;
    v_lot              RECORD;
    v_purchase_vch_id  UUID;
    v_narration        TEXT;
    v_lot_details      TEXT := '';
    v_ap_acc_id        UUID;
    v_inventory_acc_id UUID;
    v_arrival_total    NUMERIC := 0;
BEGIN
    SELECT * INTO v_arrival FROM mandi.arrivals WHERE id = p_arrival_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- Account lookups with full fallback chain
    v_ap_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = v_arrival.organization_id AND account_sub_type = 'accounts_payable' ORDER BY created_at LIMIT 1);
    IF v_ap_acc_id IS NULL THEN
        v_ap_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = v_arrival.organization_id AND type = 'liability' AND name ILIKE '%Payable%' LIMIT 1);
    END IF;
    IF v_ap_acc_id IS NULL THEN
        v_ap_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = v_arrival.organization_id AND type = 'liability' LIMIT 1);
    END IF;

    v_inventory_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = v_arrival.organization_id AND account_sub_type = 'inventory' LIMIT 1);
    IF v_inventory_acc_id IS NULL THEN
        v_inventory_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = v_arrival.organization_id AND type = 'asset' AND name ILIKE '%Stock%' LIMIT 1);
    END IF;

    IF v_ap_acc_id IS NULL OR v_inventory_acc_id IS NULL THEN
        RAISE WARNING 'post_arrival_ledger: Missing AP or Inventory account for org %. Skipping.', v_arrival.organization_id;
        RETURN;
    END IF;

    -- PART 1: PURCHASE VOUCHER (idempotent)
    SELECT id INTO v_purchase_vch_id FROM mandi.vouchers
    WHERE arrival_id = p_arrival_id AND type = 'purchase' LIMIT 1;

    IF v_purchase_vch_id IS NULL THEN
        FOR v_lot IN
            SELECT l.*, c.name AS item_name FROM mandi.lots l
            JOIN mandi.commodities c ON l.item_id = c.id
            WHERE l.arrival_id = p_arrival_id
        LOOP
            v_lot_details := v_lot_details || v_lot.item_name || ' (Lot: ' || v_lot.lot_code || ', ' || v_lot.initial_qty || ' @ Rs.' || v_lot.supplier_rate || ') ';
            v_arrival_total := v_arrival_total + COALESCE(v_lot.net_payable, 0);
        END LOOP;

        v_narration := 'Purchase Bill #' || COALESCE(v_arrival.bill_no::text, '-') || ' | ' || TRIM(v_lot_details);

        IF v_arrival_total > 0 THEN
            INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, arrival_id)
            VALUES (v_arrival.organization_id, v_arrival.created_at, 'purchase',
                (SELECT COALESCE(MAX(voucher_no),0)+1 FROM mandi.vouchers WHERE organization_id = v_arrival.organization_id AND type = 'purchase'),
                v_arrival_total, v_narration, p_arrival_id)
            RETURNING id INTO v_purchase_vch_id;

            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_arrival.organization_id, v_purchase_vch_id, v_inventory_acc_id, NULL,
                    v_arrival_total, 0, v_arrival.created_at, v_narration, 'purchase', p_arrival_id);

            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_arrival.organization_id, v_purchase_vch_id, v_ap_acc_id, v_arrival.party_id,
                    0, v_arrival_total, v_arrival.created_at, v_narration, 'purchase', p_arrival_id);
        END IF;
    END IF;

    -- PART 2: ADVANCE PAYMENT (cash/bank/upi only — cheque handled on clearing)
    IF COALESCE(v_arrival.advance_amount, 0) > 0.01
       AND COALESCE(v_arrival.advance_payment_mode, '') IN ('cash', 'bank', 'upi')
    THEN
        PERFORM mandi.post_arrival_advance_payment(
            p_arrival_id, v_arrival.organization_id, v_arrival.party_id,
            v_arrival.advance_amount, v_arrival.advance_payment_mode,
            v_arrival.bill_no, v_arrival.created_at, v_ap_acc_id
        );
    END IF;
END;
$function$;


-- RECOVERY: Post missing payment legs for historical arrivals
DO $$
DECLARE v_row RECORD;
BEGIN
    FOR v_row IN
        SELECT a.id FROM mandi.arrivals a
        WHERE a.advance_amount > 0.01
          AND a.advance_payment_mode IN ('cash', 'bank', 'upi')
          AND NOT EXISTS (SELECT 1 FROM mandi.vouchers v WHERE v.arrival_id = a.id AND v.type = 'payment')
          AND EXISTS     (SELECT 1 FROM mandi.vouchers v WHERE v.arrival_id = a.id AND v.type = 'purchase')
    LOOP
        PERFORM mandi.post_arrival_ledger(v_row.id);
    END LOOP;
END;
$$;
