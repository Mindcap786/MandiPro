-- ============================================================
-- MANDI COMMISSION SESSION MODULE
-- Migration: 20260419_mandi_commission_session.sql
-- Creates:
--   1. mandi.mandi_sessions        — header linking farmers + buyer
--   2. mandi.mandi_session_farmers — one row per farmer in a session
--   3. mandi.commit_mandi_session  — atomic RPC to save everything
-- Zero impact on existing arrivals/sales/ledger flows.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. MANDI_SESSIONS TABLE
-- ─────────────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_mandi_sessions_org ON mandi.mandi_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_mandi_sessions_date ON mandi.mandi_sessions(organization_id, session_date DESC);

-- ─────────────────────────────────────────────────────────────
-- 2. MANDI_SESSION_FARMERS TABLE
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mandi.mandi_session_farmers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL REFERENCES mandi.mandi_sessions(id) ON DELETE CASCADE,
    organization_id     UUID NOT NULL,
    sort_order          INT DEFAULT 0,
    
    -- Farmer
    farmer_id           UUID REFERENCES mandi.contacts(id) ON DELETE SET NULL,
    farmer_name         TEXT,                             -- snapshot at time of entry
    
    -- Item (captures unique item + variety + grade combo)
    item_id             UUID REFERENCES mandi.commodities(id) ON DELETE SET NULL,
    item_name           TEXT,                             -- snapshot
    variety             TEXT,
    grade               TEXT DEFAULT 'A',
    
    -- Quantities
    qty                 NUMERIC(14,3) NOT NULL DEFAULT 0,
    unit                TEXT NOT NULL DEFAULT 'Kg',
    rate                NUMERIC(14,2) NOT NULL DEFAULT 0,
    
    -- Less logic
    less_percent        NUMERIC(5,2) DEFAULT 0,
    less_units          NUMERIC(14,3) DEFAULT 0,
    
    -- Charges
    loading_charges     NUMERIC(14,2) DEFAULT 0,
    other_charges       NUMERIC(14,2) DEFAULT 0,
    commission_percent  NUMERIC(5,2) DEFAULT 0,
    
    -- Computed values (stored on commit for bill rendering)
    gross_amount        NUMERIC(14,2) DEFAULT 0,
    less_amount         NUMERIC(14,2) DEFAULT 0,
    net_amount          NUMERIC(14,2) DEFAULT 0,
    commission_amount   NUMERIC(14,2) DEFAULT 0,
    net_payable         NUMERIC(14,2) DEFAULT 0,
    net_qty             NUMERIC(14,3) DEFAULT 0,
    
    -- Link to generated records
    arrival_id          UUID REFERENCES mandi.arrivals(id) ON DELETE SET NULL,
    
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mandi_session_farmers_session ON mandi.mandi_session_farmers(session_id);
CREATE INDEX IF NOT EXISTS idx_mandi_session_farmers_org ON mandi.mandi_session_farmers(organization_id);

-- ─────────────────────────────────────────────────────────────
-- 3. RLS POLICIES
-- ─────────────────────────────────────────────────────────────
ALTER TABLE mandi.mandi_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandi.mandi_session_farmers ENABLE ROW LEVEL SECURITY;

-- Sessions: org-scoped
CREATE POLICY "mandi_sessions_org_isolation" ON mandi.mandi_sessions
    FOR ALL USING (organization_id = (core.get_my_org_id())::uuid);

-- Session farmers: org-scoped
CREATE POLICY "mandi_session_farmers_org_isolation" ON mandi.mandi_session_farmers
    FOR ALL USING (organization_id = (core.get_my_org_id())::uuid);

-- ─────────────────────────────────────────────────────────────
-- 4. COMMIT_MANDI_SESSION RPC
-- This is the single atomic function that:
--   a. Creates one mandi.arrivals record per farmer row
--   b. Posts the arrival ledger (commission income, farmer payable)
--   c. If buyer_id exists: creates a sale bill aggregating all net qty
--   d. Updates session with all generated IDs + totals
--   e. Returns bill IDs for the UI to display
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mandi.commit_mandi_session(
    p_session_id UUID
)
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
    
    -- Computed per farmer
    v_net_qty           NUMERIC;
    v_net_amount        NUMERIC;
    v_less_amount       NUMERIC;
    v_commission_amount NUMERIC;
    v_net_payable       NUMERIC;
    v_gross_amount      NUMERIC;
    v_less_units_calc   NUMERIC;
    
    -- Aggregates for buyer
    v_total_net_qty     NUMERIC := 0;
    v_total_commission  NUMERIC := 0;
    v_total_purchase    NUMERIC := 0;
    v_buyer_sale_id     UUID;
    v_buyer_grand_total NUMERIC;
    v_sale_items        JSONB := '[]'::JSONB;
    v_lot_code          TEXT;
    
    -- Result arrays
    v_purchase_bill_ids UUID[] := '{}';
    v_arrival_ids       UUID[] := '{}';
    v_result            JSONB;
    v_post_result       JSONB;
    
    v_idempotency_key   TEXT;
BEGIN
    -- Load session
    SELECT * INTO v_session FROM mandi.mandi_sessions WHERE id = p_session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session % not found', p_session_id;
    END IF;
    
    IF v_session.status = 'committed' THEN
        RAISE EXCEPTION 'Session already committed';
    END IF;
    
    v_org_id := v_session.organization_id;
    
    -- Lot prefix from lot_no header or date-based default
    v_lot_prefix := COALESCE(
        NULLIF(v_session.lot_no, ''),
        'MCS-' || TO_CHAR(v_session.session_date, 'YYMMDD')
    );
    
    -- ── STEP 1: Create one Arrival per farmer row ─────────────────
    FOR v_farmer IN
        SELECT * FROM mandi.mandi_session_farmers
        WHERE session_id = p_session_id
        ORDER BY sort_order ASC, created_at ASC
    LOOP
        -- ── Computations ──
        -- Less units: use entered value OR compute from less%
        IF COALESCE(v_farmer.less_units, 0) > 0 THEN
            v_less_units_calc := v_farmer.less_units;
        ELSIF COALESCE(v_farmer.less_percent, 0) > 0 THEN
            v_less_units_calc := ROUND(v_farmer.qty * v_farmer.less_percent / 100.0, 3);
        ELSE
            v_less_units_calc := 0;
        END IF;
        
        v_net_qty       := GREATEST(v_farmer.qty - v_less_units_calc, 0);
        v_gross_amount  := ROUND(v_farmer.qty * v_farmer.rate, 2);
        v_less_amount   := ROUND(v_less_units_calc * v_farmer.rate, 2);
        v_net_amount    := ROUND(v_net_qty * v_farmer.rate, 2);
        v_commission_amount := ROUND(v_net_amount * COALESCE(v_farmer.commission_percent, 0) / 100.0, 2);
        v_net_payable   := v_net_amount - v_commission_amount 
                           - COALESCE(v_farmer.loading_charges, 0)
                           - COALESCE(v_farmer.other_charges, 0);
        
        -- ── Update computed values on farmer row ──
        UPDATE mandi.mandi_session_farmers SET
            less_units      = v_less_units_calc,
            net_qty         = v_net_qty,
            gross_amount    = v_gross_amount,
            less_amount     = v_less_amount,
            net_amount      = v_net_amount,
            commission_amount = v_commission_amount,
            net_payable     = v_net_payable
        WHERE id = v_farmer.id;
        
        -- ── Insert Arrival ──
        SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no
        FROM mandi.arrivals WHERE organization_id = v_org_id;
        
        INSERT INTO mandi.arrivals (
            organization_id,
            arrival_date,
            party_id,
            arrival_type,
            lot_prefix,
            vehicle_number,
            reference_no,
            hire_charges,
            hamali_expenses,
            other_expenses,
            advance,
            advance_payment_mode,
            bill_no,
            status
        ) VALUES (
            v_org_id,
            v_session.session_date,
            v_farmer.farmer_id,
            'commission',
            v_lot_prefix,
            NULLIF(v_session.vehicle_no, ''),
            NULLIF(v_session.book_no, ''),
            0, 0, 0, 0, 'credit',
            v_bill_no,
            'pending'
        ) RETURNING id INTO v_arrival_id;
        
        -- ── Insert Lot ──
        v_lot_code := v_lot_prefix || '-' || LPAD(v_bill_no::TEXT, 3, '0');
        
        INSERT INTO mandi.lots (
            organization_id,
            arrival_id,
            item_id,
            lot_code,
            initial_qty,
            current_qty,
            gross_quantity,
            unit,
            supplier_rate,
            commission_percent,
            less_percent,
            less_units,
            packing_cost,
            loading_cost,
            farmer_charges,
            variety,
            grade,
            arrival_type,
            status
        ) VALUES (
            v_org_id,
            v_arrival_id,
            v_farmer.item_id,
            v_lot_code,
            v_net_qty,     -- initial_qty = net qty (after less)
            v_net_qty,     -- current_qty starts as net
            v_farmer.qty,  -- gross_quantity = original qty before less
            v_farmer.unit,
            v_farmer.rate,
            COALESCE(v_farmer.commission_percent, 0),
            COALESCE(v_farmer.less_percent, 0),
            v_less_units_calc,
            0,
            COALESCE(v_farmer.loading_charges, 0),
            COALESCE(v_farmer.other_charges, 0),
            NULLIF(v_farmer.variety, ''),
            COALESCE(NULLIF(v_farmer.grade, ''), 'A'),
            'commission',
            'active'
        ) RETURNING id INTO v_lot_id;
        
        -- ── Link arrival back to farmer row ──
        UPDATE mandi.mandi_session_farmers
        SET arrival_id = v_arrival_id
        WHERE id = v_farmer.id;
        
        -- ── Post Ledger via existing post_arrival_ledger RPC ──
        SELECT mandi.post_arrival_ledger(v_arrival_id) INTO v_post_result;
        
        -- Accumulate
        v_total_net_qty     := v_total_net_qty     + v_net_qty;
        v_total_commission  := v_total_commission  + v_commission_amount;
        v_total_purchase    := v_total_purchase    + v_net_amount;
        
        v_arrival_ids  := array_append(v_arrival_ids, v_arrival_id);
        
        -- Accumulate sale items (lot_id + net_qty + rate)
        -- For buyer bill: we sell at buyer's sale rate, but we reference these lots
        v_sale_items := v_sale_items || jsonb_build_object(
            'lot_id',   v_lot_id,
            'item_id',  v_farmer.item_id,
            'qty',      v_net_qty,
            'rate',     0,        -- will be overridden below
            'amount',   0,
            'unit',     v_farmer.unit
        );
    END LOOP;
    
    -- ── STEP 2: Create Buyer Sale Bill (if buyer selected) ───────
    IF v_session.buyer_id IS NOT NULL AND v_total_net_qty > 0 THEN
        -- Fetch sale rate from session (stored in buyer_loading_charges column reuse won't work —
        -- we need a sale_rate. We'll get it from the sale_items JSONB we'll pass in)
        -- NOTE: The caller will have set sale_rate on each farmer row as sale_rate.
        -- We aggregate total sale amount = sum(net_qty * sale_rate per farmer)
        -- For simplicity and per business requirement: single sale rate for all qty
        -- Fetch sale rate from session metadata stored in lot_no field: not ideal
        -- Instead we read it from a temp field we'll use: buyer_payable holds sale amount
        -- buyer_payable = total_qty * sale_rate + buyer_charges (set by UI before calling RPC)
        -- So we derive: total_item_amount = buyer_payable - buyer_loading - buyer_packing
        
        -- Actually, the cleanest approach: sale rate is stored per-farmer-row 
        -- (each farmer's net qty sold at the SAME buyer rate = session-level sale_rate)
        -- The UI passes buyer_payable = total_net_qty * sale_rate + charges
        -- We compute item amount = buyer_payable - loading - packing
        
        DECLARE
            v_sale_rate         NUMERIC;
            v_item_amount       NUMERIC;
            v_final_sale_items  JSONB := '[]'::JSONB;
            v_item              JSONB;
            v_buyer_grand_total2 NUMERIC;
        BEGIN
            -- Recompute: buyer_payable was set to: net_qty * sale_rate + loading + packing
            -- sale rate = (buyer_payable - loading - packing) / total_net_qty
            IF v_total_net_qty > 0 THEN
                v_item_amount := v_session.buyer_payable - 
                                 COALESCE(v_session.buyer_loading_charges, 0) -
                                 COALESCE(v_session.buyer_packing_charges, 0);
                v_sale_rate := CASE WHEN v_total_net_qty > 0 
                               THEN ROUND(v_item_amount / v_total_net_qty, 2) 
                               ELSE 0 END;
            ELSE
                v_item_amount := 0;
                v_sale_rate := 0;
            END IF;
            
            -- Build final sale items with correct amounts
            FOR v_item IN SELECT * FROM jsonb_array_elements(v_sale_items)
            LOOP
                DECLARE
                    v_qty_row NUMERIC := (v_item->>'qty')::NUMERIC;
                    v_row_amount NUMERIC;
                BEGIN
                    v_row_amount := ROUND(v_qty_row * v_sale_rate, 2);
                    v_final_sale_items := v_final_sale_items || jsonb_build_object(
                        'lot_id',  v_item->>'lot_id',
                        'item_id', v_item->>'item_id',
                        'qty',     v_qty_row,
                        'rate',    v_sale_rate,
                        'amount',  v_row_amount,
                        'unit',    v_item->>'unit'
                    );
                END;
            END LOOP;
            
            v_buyer_grand_total2 := v_item_amount + 
                                    COALESCE(v_session.buyer_loading_charges, 0) +
                                    COALESCE(v_session.buyer_packing_charges, 0);
            
            v_idempotency_key := 'mcs-' || p_session_id::TEXT;
            
            -- Call existing confirm_sale_transaction
            SELECT (mandi.confirm_sale_transaction(
                p_organization_id := v_org_id,
                p_buyer_id        := v_session.buyer_id,
                p_sale_date       := v_session.session_date,
                p_payment_mode    := 'credit',
                p_total_amount    := v_item_amount,
                p_items           := v_final_sale_items,
                p_loading_charges := COALESCE(v_session.buyer_loading_charges, 0),
                p_unloading_charges := 0,
                p_other_expenses  := COALESCE(v_session.buyer_packing_charges, 0),
                p_amount_received := 0,
                p_idempotency_key := v_idempotency_key,
                p_due_date        := NULL
            ))->>'sale_id' INTO v_buyer_sale_id;
        END;
    END IF;
    
    -- ── STEP 3: Update session with results ──────────────────────
    UPDATE mandi.mandi_sessions SET
        status          = 'committed',
        buyer_sale_id   = v_buyer_sale_id,
        total_purchase  = v_total_purchase,
        total_commission = v_total_commission,
        buyer_payable   = COALESCE(v_session.buyer_payable, 0),
        updated_at      = NOW()
    WHERE id = p_session_id;
    
    -- ── Return result ─────────────────────────────────────────────
    RETURN jsonb_build_object(
        'success',           true,
        'purchase_bill_ids', to_jsonb(v_arrival_ids),
        'sale_bill_id',      v_buyer_sale_id,
        'total_commission',  v_total_commission,
        'total_purchase',    v_total_purchase,
        'total_net_qty',     v_total_net_qty,
        'session_id',        p_session_id
    );
    
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'commit_mandi_session failed: %', SQLERRM;
END;
$function$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION mandi.commit_mandi_session(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. VIEW: mandi_session_summary (for the bills display tab)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW mandi.view_mandi_session_summary AS
SELECT
    ms.id AS session_id,
    ms.organization_id,
    ms.session_date,
    ms.lot_no,
    ms.vehicle_no,
    ms.book_no,
    ms.status,
    ms.total_purchase,
    ms.total_commission,
    ms.buyer_payable,
    ms.buyer_id,
    buyer.name AS buyer_name,
    ms.buyer_sale_id,
    ms.buyer_loading_charges,
    ms.buyer_packing_charges,
    ms.created_at,
    -- Farmer rows as JSON array
    (
        SELECT jsonb_agg(
            jsonb_build_object(
                'farmer_id',         msf.farmer_id,
                'farmer_name',       COALESCE(c.name, msf.farmer_name),
                'item_name',         COALESCE(comm.name, msf.item_name),
                'variety',           msf.variety,
                'grade',             msf.grade,
                'qty',               msf.qty,
                'unit',              msf.unit,
                'rate',              msf.rate,
                'less_percent',      msf.less_percent,
                'less_units',        msf.less_units,
                'net_qty',           msf.net_qty,
                'gross_amount',      msf.gross_amount,
                'less_amount',       msf.less_amount,
                'net_amount',        msf.net_amount,
                'commission_percent',msf.commission_percent,
                'commission_amount', msf.commission_amount,
                'loading_charges',   msf.loading_charges,
                'other_charges',     msf.other_charges,
                'net_payable',       msf.net_payable,
                'arrival_id',        msf.arrival_id
            ) ORDER BY msf.sort_order ASC, msf.created_at ASC
        )
        FROM mandi.mandi_session_farmers msf
        LEFT JOIN mandi.contacts c ON c.id = msf.farmer_id
        LEFT JOIN mandi.commodities comm ON comm.id = msf.item_id
        WHERE msf.session_id = ms.id
    ) AS farmers
FROM mandi.mandi_sessions ms
LEFT JOIN mandi.contacts buyer ON buyer.id = ms.buyer_id;

COMMIT;
