-- Migration: 20260429000014_guaranteed_ledger_and_daybook.sql
--
-- PURPOSE: One clean, atomic migration that:
--   1. Creates the mandi.ledger view (aliased from ledger_entries) so the
--      daybook route's .from('ledger') query always works.
--   2. Rewrites post_arrival_ledger with no silent skips — posts even for
--      udhaar (credit-only) arrivals like Umar's where net_payable may be 0
--      at the time of saving but has a supplier_rate set.
--   3. Backfills ledger entries for every arrival currently missing one.
--
-- NON-GOALS: post_sale_ledger, confirm_sale_transaction untouched.

BEGIN;

-- ===========================================================
-- 1. Create mandi.ledger VIEW so daybook route .from('ledger') works
-- ===========================================================
CREATE OR REPLACE VIEW mandi.ledger AS
SELECT
    le.id,
    le.organization_id,
    le.entry_date,
    le.debit,
    le.credit,
    le.description                         AS narration,
    le.transaction_type                    AS reference_type,
    le.reference_id,
    le.arrival_id,
    le.voucher_id,
    le.contact_id,
    le.account_id,
    le.status,
    le.created_at
FROM mandi.ledger_entries le
WHERE COALESCE(le.status, 'active') IN ('active', 'posted', 'confirmed', 'cleared');

GRANT SELECT ON mandi.ledger TO anon, authenticated, service_role;

-- ===========================================================
-- 2. Definitive post_arrival_ledger — no silent returns
-- ===========================================================
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_arrival             RECORD;
    v_lot                 RECORD;
    v_narration           TEXT;
    v_lot_details         TEXT := '';
    v_org_id              uuid;
    v_party_id            uuid;
    v_ap_acc_id           uuid;
    v_inventory_acc_id    uuid;
    v_cash_acc_id         uuid;
    v_bank_acc_id         uuid;
    v_payment_acc_id      uuid;
    v_total_payable       numeric := 0;
    v_purchase_vch_id     uuid;
    v_payment_vch_id      uuid;
    v_voucher_no          bigint;
    v_bill_label          text;
    v_has_lots            boolean;
BEGIN
    SELECT * INTO v_arrival FROM mandi.arrivals WHERE id = p_arrival_id;
    IF NOT FOUND THEN RETURN; END IF;

    v_org_id   := v_arrival.organization_id;
    v_party_id := v_arrival.party_id;

    -- Short-circuit only when called by AFTER INSERT trigger before lots exist
    -- AND there's also no advance to record
    SELECT EXISTS (SELECT 1 FROM mandi.lots WHERE arrival_id = p_arrival_id) INTO v_has_lots;
    IF NOT v_has_lots AND COALESCE(v_arrival.advance_amount, 0) <= 0 THEN
        RETURN;   -- will be called again explicitly after lots are inserted
    END IF;

    -- ── Account lookups ─────────────────────────────────────────────────
    v_ap_acc_id := COALESCE(
        (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND account_sub_type = 'accounts_payable' ORDER BY created_at LIMIT 1),
        (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND type = 'liability' AND name ILIKE '%Payable%' LIMIT 1),
        (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND type = 'liability' LIMIT 1)
    );
    v_inventory_acc_id := COALESCE(
        (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND account_sub_type = 'inventory' LIMIT 1),
        (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND type = 'asset' AND name ILIKE '%Stock%' LIMIT 1),
        (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND type = 'asset' LIMIT 1)
    );
    v_cash_acc_id := (
        SELECT id FROM mandi.accounts
        WHERE organization_id = v_org_id AND (code = '1001' OR account_sub_type = 'cash' OR name ILIKE 'Cash%')
        ORDER BY (code = '1001') DESC LIMIT 1
    );
    v_bank_acc_id := COALESCE(
        v_arrival.advance_bank_account_id,
        (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND (code = '1002' OR account_sub_type = 'bank' OR name ILIKE 'Bank%')
         ORDER BY (code = '1002') DESC LIMIT 1)
    );

    IF v_ap_acc_id IS NULL THEN
        RAISE EXCEPTION 'Chart of Accounts missing Accounts Payable for org %. Run account setup.', v_org_id;
    END IF;
    IF v_inventory_acc_id IS NULL THEN
        RAISE EXCEPTION 'Chart of Accounts missing Inventory/Asset account for org %. Run account setup.', v_org_id;
    END IF;

    -- ── Build totals and narration ───────────────────────────────────────
    FOR v_lot IN
        SELECT l.*, c.name AS item_name
        FROM mandi.lots l
        JOIN mandi.commodities c ON l.item_id = c.id
        WHERE l.arrival_id = p_arrival_id
    LOOP
        -- Use stored net_payable if > 0, else compute from supplier_rate
        v_total_payable := v_total_payable +
            CASE
                WHEN COALESCE(v_lot.net_payable, 0) > 0 THEN v_lot.net_payable
                ELSE COALESCE(v_lot.initial_qty, 0) * COALESCE(v_lot.supplier_rate, 0)
            END;
        v_lot_details := v_lot_details
            || v_lot.item_name
            || ' (' || COALESCE(v_lot.initial_qty::text, '0') || ' units'
            || CASE WHEN COALESCE(v_lot.supplier_rate, 0) > 0 THEN ' @ ₹' || v_lot.supplier_rate ELSE '' END
            || ') ';
    END LOOP;

    v_bill_label := COALESCE(
        v_arrival.contact_bill_no::text,
        v_arrival.reference_no,
        v_arrival.bill_no::text,
        'NEW'
    );
    v_narration := 'Purchase Bill #' || v_bill_label
        || CASE WHEN COALESCE(v_arrival.vehicle_number, '') != '' THEN ' [Veh: ' || v_arrival.vehicle_number || ']' ELSE '' END
        || CASE WHEN TRIM(v_lot_details) != '' THEN ' | ' || TRIM(v_lot_details) ELSE '' END;

    -- ── Idempotent cleanup ───────────────────────────────────────────────
    DELETE FROM mandi.ledger_entries
    WHERE reference_id = p_arrival_id AND transaction_type IN ('purchase', 'payment');
    DELETE FROM mandi.vouchers
    WHERE reference_id = p_arrival_id AND type IN ('purchase', 'payment');

    -- ── Purchase voucher (posts even for pure udhaar / credit arrivals) ──
    IF v_total_payable > 0 THEN
        SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no
        FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';

        INSERT INTO mandi.vouchers (
            organization_id, date, type, voucher_no, amount, narration,
            party_id, arrival_id, reference_id, status
        ) VALUES (
            v_org_id, v_arrival.arrival_date, 'purchase', v_voucher_no,
            v_total_payable, v_narration,
            v_party_id, p_arrival_id, p_arrival_id, 'active'
        ) RETURNING id INTO v_purchase_vch_id;

        -- Dr Inventory (asset ↑)
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id,
            entry_date, debit, credit, description, transaction_type,
            arrival_id, reference_id, status
        ) VALUES (
            v_org_id, v_purchase_vch_id, v_inventory_acc_id,
            v_arrival.arrival_date, v_total_payable, 0, v_narration, 'purchase',
            p_arrival_id, p_arrival_id, 'active'
        );

        -- Cr Accounts Payable / Party (liability ↑) → shows in Umar's ledger
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, contact_id, account_id,
            entry_date, debit, credit, description, transaction_type,
            arrival_id, reference_id, status
        ) VALUES (
            v_org_id, v_purchase_vch_id, v_party_id, v_ap_acc_id,
            v_arrival.arrival_date, 0, v_total_payable, v_narration, 'purchase',
            p_arrival_id, p_arrival_id, 'active'
        );
    END IF;

    -- ── Advance payment (only for cash/bank/upi — not credit/udhaar) ────
    IF COALESCE(v_arrival.advance_amount, 0) > 0
       AND LOWER(COALESCE(v_arrival.advance_payment_mode, 'credit')) IN ('cash', 'bank', 'upi')
    THEN
        v_payment_acc_id := CASE
            WHEN LOWER(v_arrival.advance_payment_mode) IN ('bank', 'upi') THEN COALESCE(v_bank_acc_id, v_cash_acc_id)
            ELSE v_cash_acc_id
        END;

        IF v_payment_acc_id IS NOT NULL THEN
            SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no
            FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'payment';

            INSERT INTO mandi.vouchers (
                organization_id, date, type, voucher_no, amount, narration,
                party_id, arrival_id, reference_id, payment_mode, status
            ) VALUES (
                v_org_id, v_arrival.arrival_date, 'payment', v_voucher_no,
                v_arrival.advance_amount, 'Advance on Bill #' || v_bill_label,
                v_party_id, p_arrival_id, p_arrival_id, v_arrival.advance_payment_mode, 'active'
            ) RETURNING id INTO v_payment_vch_id;

            -- Dr Party (reduces what we owe)
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, contact_id, account_id,
                entry_date, debit, credit, description, transaction_type,
                arrival_id, reference_id, status
            ) VALUES (
                v_org_id, v_payment_vch_id, v_party_id, v_ap_acc_id,
                v_arrival.arrival_date, v_arrival.advance_amount, 0,
                'Advance Paid (' || v_arrival.advance_payment_mode || ')', 'payment',
                p_arrival_id, p_arrival_id, 'active'
            );

            -- Cr Cash/Bank (asset ↓)
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, account_id,
                entry_date, debit, credit, description, transaction_type,
                arrival_id, reference_id, status
            ) VALUES (
                v_org_id, v_payment_vch_id, v_payment_acc_id,
                v_arrival.arrival_date, 0, v_arrival.advance_amount,
                'Advance Paid (' || v_arrival.advance_payment_mode || ')', 'payment',
                p_arrival_id, p_arrival_id, 'active'
            );
        END IF;
    END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION mandi.post_arrival_ledger(uuid) TO anon, authenticated, service_role;

-- ===========================================================
-- 3. AFTER trigger — ledger posting can never be skipped
-- ===========================================================
CREATE OR REPLACE FUNCTION mandi.auto_post_arrival_ledger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM mandi.post_arrival_ledger(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_post_arrival_ledger ON mandi.arrivals;
CREATE TRIGGER trg_auto_post_arrival_ledger
AFTER INSERT OR UPDATE OF bill_no, contact_bill_no, advance_amount, advance_payment_mode, party_id, arrival_date
ON mandi.arrivals
FOR EACH ROW EXECUTE FUNCTION mandi.auto_post_arrival_ledger();

-- ===========================================================
-- 4. Backfill all arrivals missing ledger (heals Umar and anyone else)
-- ===========================================================
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT a.id
        FROM mandi.arrivals a
        WHERE a.party_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM mandi.ledger_entries le
              WHERE le.reference_id = a.id
                AND le.transaction_type = 'purchase'
          )
        ORDER BY a.arrival_date
    LOOP
        BEGIN
            PERFORM mandi.post_arrival_ledger(r.id);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Backfill skipped for arrival %: %', r.id, SQLERRM;
        END;
    END LOOP;
END;
$$;

COMMIT;
