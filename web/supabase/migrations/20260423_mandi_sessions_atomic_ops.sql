-- ============================================================
-- MANDI COMMISSION SESSION INFRASTRUCTURE (RESTORATION)
-- Migration: 20260423_mandi_sessions_atomic_ops.sql
-- ============================================================

BEGIN;

-- 1. HARDEN ARRIVALS & LOTS SCHEMA
-- Ensure mandi.arrivals has all required columns for sessions
ALTER TABLE mandi.arrivals ADD COLUMN IF NOT EXISTS bill_no BIGINT;
ALTER TABLE mandi.arrivals ADD COLUMN IF NOT EXISTS reference_no TEXT;
ALTER TABLE mandi.arrivals ADD COLUMN IF NOT EXISTS vehicle_number TEXT;
ALTER TABLE mandi.arrivals ADD COLUMN IF NOT EXISTS lot_prefix TEXT;
ALTER TABLE mandi.arrivals ADD COLUMN IF NOT EXISTS hire_charges NUMERIC(14,2) DEFAULT 0;
ALTER TABLE mandi.arrivals ADD COLUMN IF NOT EXISTS hamali_expenses NUMERIC(14,2) DEFAULT 0;
ALTER TABLE mandi.arrivals ADD COLUMN IF NOT EXISTS other_expenses NUMERIC(14,2) DEFAULT 0;
ALTER TABLE mandi.arrivals ADD COLUMN IF NOT EXISTS advance NUMERIC(14,2) DEFAULT 0;
ALTER TABLE mandi.arrivals ADD COLUMN IF NOT EXISTS advance_payment_mode TEXT DEFAULT 'credit';

-- Ensure mandi.lots has all required columns for variants and charges
ALTER TABLE mandi.lots ADD COLUMN IF NOT EXISTS variety TEXT;
ALTER TABLE mandi.lots ADD COLUMN IF NOT EXISTS grade TEXT DEFAULT 'A';
ALTER TABLE mandi.lots ADD COLUMN IF NOT EXISTS gross_quantity NUMERIC(14,3);
ALTER TABLE mandi.lots ADD COLUMN IF NOT EXISTS farmer_charges NUMERIC(14,2) DEFAULT 0;
ALTER TABLE mandi.lots ADD COLUMN IF NOT EXISTS loading_cost NUMERIC(14,2) DEFAULT 0;
ALTER TABLE mandi.lots ADD COLUMN IF NOT EXISTS packing_cost NUMERIC(14,2) DEFAULT 0;
ALTER TABLE mandi.lots ADD COLUMN IF NOT EXISTS arrival_type TEXT DEFAULT 'commission';
ALTER TABLE mandi.lots ADD COLUMN IF NOT EXISTS initial_qty NUMERIC(14,3);
ALTER TABLE mandi.lots ADD COLUMN IF NOT EXISTS current_qty NUMERIC(14,3);

-- Ensure mandi.lots uses 'item_id' for consistency with sale_items
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'mandi' AND table_name = 'lots' AND column_name = 'item_id') THEN
        ALTER TABLE mandi.lots RENAME COLUMN commodity_id TO item_id;
    END IF;
EXCEPTION WHEN OTHERS THEN 
    -- Column might not exist at all, or be named differently, skip if so
END $$;

-- 2. CREATE SESSION TABLES
CREATE TABLE IF NOT EXISTS mandi.mandi_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    session_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    lot_no              TEXT,
    vehicle_no          TEXT,
    book_no             TEXT,
    buyer_id            UUID REFERENCES mandi.contacts(id) ON DELETE SET NULL,
    buyer_sale_id       UUID REFERENCES mandi.sales(id) ON DELETE SET NULL,
    buyer_loading_charges NUMERIC(14,2) DEFAULT 0,
    buyer_packing_charges NUMERIC(14,2) DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'committed')),
    total_purchase      NUMERIC(14,2) DEFAULT 0,
    total_commission    NUMERIC(14,2) DEFAULT 0,
    buyer_payable       NUMERIC(14,2) DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mandi.mandi_session_farmers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL REFERENCES mandi.mandi_sessions(id) ON DELETE CASCADE,
    organization_id     UUID NOT NULL,
    sort_order          INT DEFAULT 0,
    farmer_id           UUID REFERENCES mandi.contacts(id) ON DELETE SET NULL,
    farmer_name         TEXT,
    item_id             UUID REFERENCES mandi.commodities(id) ON DELETE SET NULL,
    item_name           TEXT,
    variety             TEXT,
    grade               TEXT DEFAULT 'A',
    qty                 NUMERIC(14,3) NOT NULL DEFAULT 0,
    unit                TEXT NOT NULL DEFAULT 'Kg',
    rate                NUMERIC(14,2) NOT NULL DEFAULT 0,
    less_percent        NUMERIC(5,2) DEFAULT 0,
    less_units          NUMERIC(14,3) DEFAULT 0,
    loading_charges     NUMERIC(14,2) DEFAULT 0,
    other_charges       NUMERIC(14,2) DEFAULT 0,
    commission_percent  NUMERIC(5,2) DEFAULT 0,
    gross_amount        NUMERIC(14,2) DEFAULT 0,
    less_amount         NUMERIC(14,2) DEFAULT 0,
    net_amount          NUMERIC(14,2) DEFAULT 0,
    commission_amount   NUMERIC(14,2) DEFAULT 0,
    net_payable         NUMERIC(14,2) DEFAULT 0,
    net_qty             NUMERIC(14,3) DEFAULT 0,
    arrival_id          UUID REFERENCES mandi.arrivals(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RLS
ALTER TABLE mandi.mandi_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandi.mandi_session_farmers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mandi_sessions_org_isolation" ON mandi.mandi_sessions
    FOR ALL USING (organization_id = (core.get_my_org_id())::uuid);
CREATE POLICY "mandi_session_farmers_org_isolation" ON mandi.mandi_session_farmers
    FOR ALL USING (organization_id = (core.get_my_org_id())::uuid);

-- 4. COMMIT_MANDI_SESSION RPC
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
BEGIN
    SELECT * INTO v_session FROM mandi.mandi_sessions WHERE id = p_session_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Session % not found', p_session_id; END IF;
    IF v_session.status = 'committed' THEN RAISE EXCEPTION 'Session already committed'; END IF;
    v_org_id := v_session.organization_id;
    v_lot_prefix := COALESCE(NULLIF(v_session.lot_no, ''), 'MCS-' || TO_CHAR(v_session.session_date, 'YYMMDD'));

    FOR v_farmer IN SELECT * FROM mandi.mandi_session_farmers WHERE session_id = p_session_id ORDER BY sort_order ASC LOOP
        v_less_units_calc := COALESCE(v_farmer.less_units, 0);
        v_net_qty       := GREATEST(v_farmer.qty - v_less_units_calc, 0);
        v_gross_amount  := ROUND(v_farmer.qty * v_farmer.rate, 2);
        v_net_amount    := ROUND(v_net_qty * v_farmer.rate, 2);
        v_commission_amount := ROUND(v_net_amount * COALESCE(v_farmer.commission_percent, 0) / 100.0, 2);
        v_net_payable   := v_net_amount - v_commission_amount - COALESCE(v_farmer.loading_charges, 0) - COALESCE(v_farmer.other_charges, 0);

        SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no FROM mandi.arrivals WHERE organization_id = v_org_id;

        INSERT INTO mandi.arrivals (organization_id, arrival_date, party_id, arrival_type, lot_prefix, vehicle_number, reference_no, bill_no, status)
        VALUES (v_org_id, v_session.session_date, v_farmer.farmer_id, 'commission', v_lot_prefix, v_session.vehicle_no, v_session.book_no, v_bill_no, 'pending')
        RETURNING id INTO v_arrival_id;

        v_lot_code := v_lot_prefix || '-' || LPAD(v_bill_no::TEXT, 3, '0');
        INSERT INTO mandi.lots (organization_id, arrival_id, item_id, lot_code, initial_qty, current_qty, gross_quantity, unit, supplier_rate, commission_percent, less_percent, less_units, loading_cost, farmer_charges, variety, grade, arrival_type, status)
        VALUES (v_org_id, v_arrival_id, v_farmer.item_id, v_lot_code, v_net_qty, v_net_qty, v_farmer.qty, v_farmer.unit, v_farmer.rate, v_farmer.commission_percent, v_farmer.less_percent, v_less_units_calc, v_farmer.loading_charges, v_farmer.other_charges, v_farmer.variety, v_farmer.grade, 'commission', 'active')
        RETURNING id INTO v_lot_id;

        UPDATE mandi.mandi_session_farmers SET arrival_id = v_arrival_id WHERE id = v_farmer.id;
        PERFORM mandi.post_arrival_ledger(v_arrival_id);

        v_total_net_qty := v_total_net_qty + v_net_qty;
        v_total_commission := v_total_commission + v_commission_amount;
        v_total_purchase := v_total_purchase + v_net_amount;
        v_arrival_ids := array_append(v_arrival_ids, v_arrival_id);
        
        v_sale_items_tmp := v_sale_items_tmp || jsonb_build_object('lot_id', v_lot_id, 'item_id', v_farmer.item_id, 'qty', v_net_qty, 'unit', v_farmer.unit);
    END LOOP;

    IF v_session.buyer_id IS NOT NULL AND v_total_net_qty > 0 THEN
        v_item_amount := v_session.buyer_payable - COALESCE(v_session.buyer_loading_charges, 0) - COALESCE(v_session.buyer_packing_charges, 0);
        v_sale_rate := ROUND(v_item_amount / v_total_net_qty, 2);
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_sale_items_tmp) LOOP
            v_final_sale_items := v_final_sale_items || (v_item || jsonb_build_object('rate', v_sale_rate, 'amount', ROUND((v_item->>'qty')::NUMERIC * v_sale_rate, 2)));
        END LOOP;

        SELECT (mandi.confirm_sale_transaction(
            p_organization_id := v_org_id, p_buyer_id := v_session.buyer_id, p_sale_date := v_session.session_date, p_payment_mode := 'credit',
            p_total_amount := v_item_amount, p_items := v_final_sale_items, p_loading_charges := v_session.buyer_loading_charges, 
            p_unloading_charges := 0, p_other_expenses := v_session.buyer_packing_charges, p_amount_received := 0, p_idempotency_key := 'mcs-' || p_session_id::TEXT
        ))->>'sale_id' INTO v_buyer_sale_id;
    END IF;

    UPDATE mandi.mandi_sessions SET status = 'committed', buyer_sale_id = v_buyer_sale_id, total_purchase = v_total_purchase, total_commission = v_total_commission, updated_at = NOW() WHERE id = p_session_id;

    RETURN jsonb_build_object('success', true, 'purchase_bill_ids', to_jsonb(v_arrival_ids), 'sale_bill_id', v_buyer_sale_id, 'total_commission', v_total_commission, 'total_purchase', v_total_purchase, 'total_net_qty', v_total_net_qty);
END;
$function$;

GRANT EXECUTE ON FUNCTION mandi.commit_mandi_session(UUID) TO authenticated;

-- 5. VIEW
CREATE OR REPLACE VIEW mandi.view_mandi_session_summary AS
SELECT ms.id AS session_id, ms.organization_id, ms.session_date, ms.lot_no, ms.vehicle_no, ms.book_no, ms.status, ms.total_purchase, ms.total_commission, ms.buyer_payable, ms.buyer_id, buyer.name AS buyer_name, ms.buyer_sale_id, ms.buyer_loading_charges, ms.buyer_packing_charges,
    (SELECT jsonb_agg(jsonb_build_object('farmer_name', COALESCE(c.name, msf.farmer_name), 'item_name', COALESCE(comm.name, msf.item_name), 'variety', msf.variety, 'grade', msf.grade, 'qty', msf.qty, 'net_qty', msf.net_qty, 'net_payable', msf.net_payable, 'arrival_id', msf.arrival_id) ORDER BY msf.sort_order ASC) FROM mandi.mandi_session_farmers msf LEFT JOIN mandi.contacts c ON c.id = msf.farmer_id LEFT JOIN mandi.commodities comm ON comm.id = msf.item_id WHERE msf.session_id = ms.id) AS farmers
FROM mandi.mandi_sessions ms LEFT JOIN mandi.contacts buyer ON buyer.id = ms.buyer_id;

COMMIT;
