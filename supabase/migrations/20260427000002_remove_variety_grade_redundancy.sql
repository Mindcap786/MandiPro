-- ============================================================
-- REMOVE VARIETY AND GRADE REDUNDANCY
-- Migration: 20260427000002_remove_variety_grade_redundancy.sql
-- ============================================================

BEGIN;

-- [1] DROP COLUMNS (CASCADE handles dependent views/functions)
ALTER TABLE mandi.lots DROP COLUMN IF EXISTS variety CASCADE;
ALTER TABLE mandi.lots DROP COLUMN IF EXISTS grade CASCADE;

ALTER TABLE mandi.mandi_session_farmers DROP COLUMN IF EXISTS variety CASCADE;
ALTER TABLE mandi.mandi_session_farmers DROP COLUMN IF EXISTS grade CASCADE;

-- [2] RECREATE VIEW (Removing redundant columns)
CREATE OR REPLACE VIEW mandi.view_lot_stock AS
SELECT l.id,
    l.organization_id,
    l.created_at,
    l.lot_code,
    l.contact_id,
    l.item_id,
    l.arrival_type,
    l.initial_qty,
    l.current_qty,
    l.unit,
    l.status,
    l.arrival_id,
    l.unit_weight,
    l.total_weight,
    l.supplier_rate,
    l.commission_percent,
    l.farmer_charges,
    COALESCE(l.shelf_life_days, i.shelf_life_days) AS shelf_life_days,
    COALESCE(l.critical_age_days, i.critical_age_days) AS critical_age_days,
    i.name AS item_name,
    c.name AS farmer_name,
    c.city AS farmer_city
FROM mandi.lots l
JOIN mandi.commodities i ON l.item_id = i.id
LEFT JOIN mandi.contacts c ON l.contact_id = c.id;

-- [3] REFACTOR COMMIT_MANDI_SESSION (Remove variety/grade assignments)
CREATE OR REPLACE FUNCTION mandi.commit_mandi_session(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public', 'extensions'
AS $$
DECLARE
    v_session RECORD;
    v_farmer RECORD;
    v_org_id UUID;
    v_lot_prefix TEXT;
    v_arrival_id UUID;
    v_lot_id UUID;
    v_bill_no BIGINT;
    v_less_units_calc NUMERIC;
    v_net_qty NUMERIC;
    v_gross_amount NUMERIC;
    v_less_amount NUMERIC;
    v_net_amount NUMERIC;
    v_commission_amount NUMERIC;
    v_net_payable NUMERIC;
    v_total_net_qty NUMERIC := 0;
    v_total_commission NUMERIC := 0;
    v_total_purchase NUMERIC := 0;
    v_sale_items_tmp JSONB := '[]'::JSONB;
    v_final_sale_items JSONB := '[]'::JSONB;
    v_item JSONB;
    v_item_amount NUMERIC := 0;
    v_sale_rate NUMERIC := 0;
    v_buyer_sale_id UUID;
    v_arrival_ids UUID[] := '{}';
BEGIN
    SELECT * INTO v_session FROM mandi.mandi_sessions WHERE id = p_session_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Session % not found', p_session_id; END IF;
    IF v_session.status = 'committed' THEN RAISE EXCEPTION 'Session already committed'; END IF;

    v_org_id := v_session.organization_id;
    v_lot_prefix := COALESCE(NULLIF(v_session.lot_no, ''), 'MCS-' || TO_CHAR(v_session.session_date, 'YYMMDD'));

    FOR v_farmer IN
        SELECT * FROM mandi.mandi_session_farmers WHERE session_id = p_session_id ORDER BY sort_order, created_at
    LOOP
        -- Logic for net quantities and amounts
        IF COALESCE(v_farmer.less_units, 0) > 0 THEN v_less_units_calc := v_farmer.less_units;
        ELSIF COALESCE(v_farmer.less_percent, 0) > 0 THEN v_less_units_calc := ROUND(v_farmer.qty * v_farmer.less_percent / 100.0, 3);
        ELSE v_less_units_calc := 0; END IF;

        v_net_qty := GREATEST(COALESCE(v_farmer.qty, 0) - v_less_units_calc, 0);
        v_gross_amount := ROUND(COALESCE(v_farmer.qty, 0) * COALESCE(v_farmer.rate, 0), 2);
        v_less_amount := ROUND(v_less_units_calc * COALESCE(v_farmer.rate, 0), 2);
        v_net_amount := ROUND(v_net_qty * COALESCE(v_farmer.rate, 0), 2);
        v_commission_amount := ROUND(v_net_amount * COALESCE(v_farmer.commission_percent, 0) / 100.0, 2);
        v_net_payable := ROUND(v_net_amount - v_commission_amount - COALESCE(v_farmer.loading_charges, 0) - COALESCE(v_farmer.other_charges, 0), 2);

        UPDATE mandi.mandi_session_farmers
        SET less_units = v_less_units_calc, net_qty = v_net_qty, gross_amount = v_gross_amount,
            less_amount = v_less_amount, net_amount = v_net_amount, commission_amount = v_commission_amount, net_payable = v_net_payable
        WHERE id = v_farmer.id;

        SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no FROM mandi.arrivals WHERE organization_id = v_org_id;

        INSERT INTO mandi.arrivals (
            organization_id, arrival_date, party_id, arrival_type, lot_prefix, vehicle_number, reference_no, bill_no, status, advance, advance_payment_mode
        ) VALUES (
            v_org_id, v_session.session_date, v_farmer.farmer_id, 'commission', v_lot_prefix, NULLIF(v_session.vehicle_no, ''), NULLIF(v_session.book_no, ''), v_bill_no, 'pending', 0, 'credit'
        ) RETURNING id INTO v_arrival_id;

        INSERT INTO mandi.lots (
            organization_id, arrival_id, item_id, contact_id, lot_code, initial_qty, current_qty, gross_quantity, unit, supplier_rate, commission_percent, less_percent, less_units, packing_cost, loading_cost, farmer_charges, arrival_type, status, net_payable, payment_status
        ) VALUES (
            v_org_id, v_arrival_id, v_farmer.item_id, v_farmer.farmer_id, v_lot_prefix || '-' || LPAD(v_bill_no::TEXT, 3, '0'), v_net_qty, v_net_qty, v_farmer.qty, COALESCE(v_farmer.unit, 'Kg'), COALESCE(v_farmer.rate, 0), COALESCE(v_farmer.commission_percent, 0), COALESCE(v_farmer.less_percent, 0), v_less_units_calc, 0, COALESCE(v_farmer.loading_charges, 0), COALESCE(v_farmer.other_charges, 0), 'commission', 'active', GREATEST(v_net_payable, 0), 'pending'
        ) RETURNING id INTO v_lot_id;

        UPDATE mandi.mandi_session_farmers SET arrival_id = v_arrival_id WHERE id = v_farmer.id;
        PERFORM mandi.post_arrival_ledger(v_arrival_id);

        v_total_net_qty := v_total_net_qty + v_net_qty;
        v_total_commission := v_total_commission + v_commission_amount;
        v_total_purchase := v_total_purchase + GREATEST(v_net_payable, 0);
        v_arrival_ids := array_append(v_arrival_ids, v_arrival_id);

        v_sale_items_tmp := v_sale_items_tmp || jsonb_build_object('lot_id', v_lot_id, 'item_id', v_farmer.item_id, 'qty', v_net_qty, 'unit', COALESCE(v_farmer.unit, 'Kg'));
    END LOOP;

    -- Buyer Sale Creation
    IF v_session.buyer_id IS NOT NULL AND v_total_net_qty > 0 THEN
        v_item_amount := ROUND(COALESCE(v_session.buyer_payable, 0) - COALESCE(v_session.buyer_loading_charges, 0) - COALESCE(v_session.buyer_packing_charges, 0), 2);
        v_sale_rate := ROUND(v_item_amount / v_total_net_qty, 2);

        FOR v_item IN SELECT value FROM jsonb_array_elements(v_sale_items_tmp) LOOP
            v_final_sale_items := v_final_sale_items || (v_item || jsonb_build_object('rate', v_sale_rate, 'amount', ROUND((v_item->>'qty')::NUMERIC * v_sale_rate, 2)));
        END LOOP;

        SELECT (mandi.confirm_sale_transaction(
            p_organization_id := v_org_id, p_buyer_id := v_session.buyer_id, p_sale_date := v_session.session_date, p_payment_mode := 'credit', p_total_amount := v_item_amount, p_items := v_final_sale_items, p_loading_charges := COALESCE(v_session.buyer_loading_charges, 0), p_other_expenses := COALESCE(v_session.buyer_packing_charges, 0), p_amount_received := 0, p_idempotency_key := 'mcs-' || p_session_id::TEXT
        ))->>'sale_id'::TEXT INTO v_buyer_sale_id;
    END IF;

    UPDATE mandi.mandi_sessions SET status = 'committed', buyer_sale_id = v_buyer_sale_id, total_purchase = v_total_purchase, total_commission = v_total_commission, updated_at = NOW() WHERE id = p_session_id;

    RETURN jsonb_build_object('success', true, 'session_id', p_session_id, 'purchase_bill_ids', to_jsonb(v_arrival_ids), 'sale_bill_id', v_buyer_sale_id, 'total_commission', v_total_commission, 'total_purchase', v_total_purchase, 'total_net_qty', v_total_net_qty);
END;
$$;

COMMIT;
