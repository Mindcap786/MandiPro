-- Migration: 20260421000001_fix_commission_arrivals_status_and_ledger.sql
--
-- ROOT CAUSE FIXES for Mandi Commission (Sale+Purchase) flow:
--
--   BUG 1: Arrivals show "PENDING" in Recent Activity
--     → commit_mandi_session was inserting arrivals with status='pending'.
--       All fully-committed arrivals should be status='received'.
--
--   BUG 2: Purchase arrivals NOT appearing in Daybook or Party Ledger
--     → commit_mandi_session never called compute_lot_net_payable() after
--       inserting each lot, so net_payable stayed NULL.
--       post_arrival_ledger() sums SUM(COALESCE(net_payable,0)) = 0
--       and its IF v_total_payable > 0 guard never fires → zero ledger entries.
--
--   ADDITIONAL: advance_amount was not written to the arrivals row, so even
--     advance-mode postings were skipped.
--
-- FIX: Rewrite commit_mandi_session with:
--   1. status = 'received'  (not 'pending')
--   2. advance_amount + advance_payment_mode included in INSERT
--   3. compute_lot_net_payable() called after each lot, result stored
--   4. post_arrival_ledger() called AFTER net_payable is set (unchanged line,
--      but now has data to work with)
--
-- Sales flow (confirm_sale_transaction) is intentionally untouched.

BEGIN;

CREATE OR REPLACE FUNCTION mandi.commit_mandi_session(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, public, extensions
AS $function$
DECLARE
    v_session           RECORD;
    v_farmer            RECORD;
    v_org_id            UUID;
    v_lot_prefix        TEXT;
    v_arrival_id        UUID;
    v_lot_id            UUID;
    v_bill_no           BIGINT;
    v_net_qty           NUMERIC;
    v_net_amount        NUMERIC;
    v_commission_amount NUMERIC;
    v_net_payable       NUMERIC;
    v_gross_amount      NUMERIC;
    v_less_units_calc   NUMERIC;
    v_total_net_qty     NUMERIC := 0;
    v_total_commission  NUMERIC := 0;
    v_total_purchase    NUMERIC := 0;
    v_buyer_sale_id     UUID;
    v_item_amount       NUMERIC;
    v_sale_rate         NUMERIC;
    v_final_sale_items  JSONB := '[]'::JSONB;
    v_item              JSONB;
    v_sale_items_tmp    JSONB := '[]'::JSONB;
    v_lot_code          TEXT;
    v_arrival_ids       UUID[] := '{}';
    v_computed_net      NUMERIC;
BEGIN
    SELECT * INTO v_session FROM mandi.mandi_sessions WHERE id = p_session_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Session % not found', p_session_id; END IF;
    IF v_session.status = 'committed' THEN RAISE EXCEPTION 'Session already committed'; END IF;

    v_org_id     := v_session.organization_id;
    v_lot_prefix := COALESCE(NULLIF(v_session.lot_no, ''), 'MCS-' || TO_CHAR(v_session.session_date, 'YYMMDD'));

    FOR v_farmer IN
        SELECT * FROM mandi.mandi_session_farmers
        WHERE session_id = p_session_id
        ORDER BY sort_order ASC
    LOOP
        v_less_units_calc   := COALESCE(v_farmer.less_units, 0);
        v_net_qty           := GREATEST(v_farmer.qty - v_less_units_calc, 0);
        v_gross_amount      := ROUND(v_farmer.qty  * v_farmer.rate, 2);
        v_net_amount        := ROUND(v_net_qty     * v_farmer.rate, 2);
        v_commission_amount := ROUND(v_net_amount  * COALESCE(v_farmer.commission_percent, 0) / 100.0, 2);
        v_net_payable       := v_net_amount
                               - v_commission_amount
                               - COALESCE(v_farmer.loading_charges, 0)
                               - COALESCE(v_farmer.other_charges, 0);

        -- ── Global audit bill counter ─────────────────────────────────────
        SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no
        FROM mandi.arrivals WHERE organization_id = v_org_id;

        -- ── FIX 1: status = 'received'  (was 'pending')
        -- ── FIX 2: advance_amount / advance_payment_mode included
        INSERT INTO mandi.arrivals (
            organization_id, arrival_date, party_id, arrival_type,
            lot_prefix, vehicle_number, reference_no, bill_no,
            advance_amount, advance_payment_mode,
            status
        ) VALUES (
            v_org_id, v_session.session_date, v_farmer.farmer_id, 'commission',
            v_lot_prefix, v_session.vehicle_no, v_session.book_no, v_bill_no,
            0, 'credit',          -- commission arrivals have no upfront advance
            'received'            -- ← was 'pending'
        ) RETURNING id INTO v_arrival_id;

        v_lot_code := v_lot_prefix || '-' || LPAD(v_bill_no::TEXT, 3, '0');

        INSERT INTO mandi.lots (
            organization_id, arrival_id, item_id, lot_code,
            initial_qty, current_qty, gross_quantity, unit,
            supplier_rate, commission_percent,
            less_percent, less_units, loading_cost, farmer_charges,
            variety, grade, arrival_type, status
        ) VALUES (
            v_org_id, v_arrival_id, v_farmer.item_id, v_lot_code,
            v_net_qty, v_net_qty, v_farmer.qty, v_farmer.unit,
            v_farmer.rate, v_farmer.commission_percent,
            v_farmer.less_percent, v_less_units_calc,
            v_farmer.loading_charges, v_farmer.other_charges,
            v_farmer.variety, v_farmer.grade, 'commission', 'active'
        ) RETURNING id INTO v_lot_id;

        -- ── FIX 3: compute and store net_payable so post_arrival_ledger
        --           has a non-zero total to work with
        v_computed_net := mandi.compute_lot_net_payable(v_lot_id);
        UPDATE mandi.lots SET net_payable = v_computed_net WHERE id = v_lot_id;

        UPDATE mandi.mandi_session_farmers SET arrival_id = v_arrival_id WHERE id = v_farmer.id;

        -- ── post_arrival_ledger now has net_payable > 0 → creates voucher + ledger entries ──
        PERFORM mandi.post_arrival_ledger(v_arrival_id);

        v_total_net_qty    := v_total_net_qty    + v_net_qty;
        v_total_commission := v_total_commission + v_commission_amount;
        v_total_purchase   := v_total_purchase   + v_net_amount;
        v_arrival_ids      := array_append(v_arrival_ids, v_arrival_id);

        v_sale_items_tmp := v_sale_items_tmp || jsonb_build_object(
            'lot_id', v_lot_id,
            'item_id', v_farmer.item_id,
            'qty', v_net_qty,
            'unit', v_farmer.unit
        );
    END LOOP;

    -- ── Buyer sale (unchanged logic) ──────────────────────────────────────────
    IF v_session.buyer_id IS NOT NULL AND v_total_net_qty > 0 THEN
        v_item_amount := v_session.buyer_payable
                         - COALESCE(v_session.buyer_loading_charges, 0)
                         - COALESCE(v_session.buyer_packing_charges, 0);
        v_sale_rate := ROUND(v_item_amount / v_total_net_qty, 2);

        FOR v_item IN SELECT * FROM jsonb_array_elements(v_sale_items_tmp) LOOP
            v_final_sale_items := v_final_sale_items || (
                v_item || jsonb_build_object(
                    'rate', v_sale_rate,
                    'amount', ROUND((v_item->>'qty')::NUMERIC * v_sale_rate, 2)
                )
            );
        END LOOP;

        SELECT (mandi.confirm_sale_transaction(
            p_organization_id  := v_org_id,
            p_buyer_id         := v_session.buyer_id,
            p_sale_date        := v_session.session_date,
            p_payment_mode     := 'credit',
            p_total_amount     := v_item_amount,
            p_items            := v_final_sale_items,
            p_loading_charges  := v_session.buyer_loading_charges,
            p_unloading_charges:= 0,
            p_other_expenses   := v_session.buyer_packing_charges,
            p_amount_received  := 0,
            p_idempotency_key  := 'mcs-' || p_session_id::TEXT
        ))->>'sale_id' INTO v_buyer_sale_id;
    END IF;

    UPDATE mandi.mandi_sessions
    SET status         = 'committed',
        buyer_sale_id  = v_buyer_sale_id,
        total_purchase = v_total_purchase,
        total_commission = v_total_commission,
        updated_at     = NOW()
    WHERE id = p_session_id;

    RETURN jsonb_build_object(
        'success',        true,
        'purchase_bill_ids', to_jsonb(v_arrival_ids),
        'sale_bill_id',   v_buyer_sale_id,
        'total_commission', v_total_commission,
        'total_purchase', v_total_purchase,
        'total_net_qty',  v_total_net_qty
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION mandi.commit_mandi_session(UUID) TO authenticated;

-- ── Backfill: fix existing commission arrivals that show 'pending' ─────────────
-- Set them to 'received' so they display correctly in Recent Activity.
UPDATE mandi.arrivals
SET status = 'received'
WHERE status = 'pending'
  AND arrival_type = 'commission';

-- ── Backfill: post missing ledger entries for commission arrivals ──────────────
-- First, ensure net_payable is set on lots that were created by the old commit RPC.
DO $$
DECLARE
    r RECORD;
    v_net NUMERIC;
BEGIN
    FOR r IN
        SELECT l.id
        FROM mandi.lots l
        JOIN mandi.arrivals a ON a.id = l.arrival_id
        WHERE a.arrival_type = 'commission'
          AND (l.net_payable IS NULL OR l.net_payable = 0)
          AND COALESCE(l.supplier_rate, 0) > 0
    LOOP
        BEGIN
            v_net := mandi.compute_lot_net_payable(r.id);
            UPDATE mandi.lots SET net_payable = v_net WHERE id = r.id;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'net_payable refresh skipped for lot %: %', r.id, SQLERRM;
        END;
    END LOOP;
END;
$$;

-- Now re-post ledger for arrivals that still have no purchase entry.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT a.id
        FROM mandi.arrivals a
        WHERE a.party_id IS NOT NULL
          AND a.arrival_type = 'commission'
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
            RAISE NOTICE 'Ledger backfill skipped for arrival %: %', r.id, SQLERRM;
        END;
    END LOOP;
END;
$$;

COMMIT;
