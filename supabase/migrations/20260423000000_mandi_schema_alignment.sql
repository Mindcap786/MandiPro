-- MANDI SCHEMA ALIGNMENT & RPC REPAIR (v5.30)
-- Goal: Fix missing deduction/metadata fields in Arrival and Purchase workflows.

BEGIN;

-- 1. Ensure all expected columns exist in mandi.arrivals
ALTER TABLE mandi.arrivals 
    ADD COLUMN IF NOT EXISTS arrival_no BIGINT,
    ADD COLUMN IF NOT EXISTS reference_no TEXT,
    ADD COLUMN IF NOT EXISTS vehicle_number TEXT,
    ADD COLUMN IF NOT EXISTS vehicle_type TEXT,
    ADD COLUMN IF NOT EXISTS driver_name TEXT,
    ADD COLUMN IF NOT EXISTS driver_mobile TEXT,
    ADD COLUMN IF NOT EXISTS guarantor TEXT,
    ADD COLUMN IF NOT EXISTS hire_charges NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS hamali_expenses NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS other_expenses NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 2. Ensure all expected columns exist in mandi.lots
ALTER TABLE mandi.lots
    ADD COLUMN IF NOT EXISTS unit_weight NUMERIC DEFAULT 1,
    ADD COLUMN IF NOT EXISTS total_weight NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS less_percent NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS less_units NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS packing_cost NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS loading_cost NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS farmer_charges NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sale_price NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS advance_payment_mode TEXT DEFAULT 'cash',
    ADD COLUMN IF NOT EXISTS advance_bank_account_id UUID,
    ADD COLUMN IF NOT EXISTS advance_cheque_no TEXT,
    ADD COLUMN IF NOT EXISTS advance_cheque_date DATE,
    ADD COLUMN IF NOT EXISTS advance_bank_name TEXT,
    ADD COLUMN IF NOT EXISTS advance_cheque_status BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS barcode TEXT,
    ADD COLUMN IF NOT EXISTS custom_attributes JSONB DEFAULT '{}'::jsonb;

-- 3. REPAIR RPC: create_mixed_arrival (Handles full metadata saving)
CREATE OR REPLACE FUNCTION mandi.create_mixed_arrival(
    p_arrival jsonb, 
    p_created_by uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mandi', 'public'
AS $function$
DECLARE
    v_arrival_id      UUID;
    v_party_id        UUID;
    v_organization_id UUID;
    v_lot             RECORD;
    v_lot_id          UUID;
    v_advance_amount  NUMERIC;
    v_advance_mode    TEXT;
    v_idempotency_key UUID;
    v_net_payable     NUMERIC;
    v_arrival_type    TEXT;
    v_metadata        JSONB := '{}'::jsonb;
    v_first_item      JSONB;
    v_arrival_no      BIGINT;
BEGIN
    v_organization_id := (p_arrival->>'organization_id')::UUID;
    v_party_id        := (p_arrival->>'party_id')::UUID;
    v_advance_amount  := COALESCE((p_arrival->>'advance')::NUMERIC, 0);
    v_advance_mode    := COALESCE(p_arrival->>'advance_payment_mode', 'cash');
    v_arrival_type    := COALESCE(p_arrival->>'arrival_type', 'commission');

    IF v_organization_id IS NULL THEN
        RAISE EXCEPTION 'organization_id is required';
    END IF;

    -- Idempotency check
    BEGIN
        v_idempotency_key := (p_arrival->>'idempotency_key')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_idempotency_key := NULL;
    END;

    IF v_idempotency_key IS NOT NULL THEN
        SELECT id, COALESCE(metadata, '{}'::jsonb) INTO v_arrival_id, v_metadata 
        FROM mandi.arrivals 
        WHERE idempotency_key = v_idempotency_key AND organization_id = v_organization_id;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'arrival_id', v_arrival_id, 'idempotent', true, 'metadata', v_metadata);
        END IF;
    END IF;

    -- Auto numbering for Arrival
    SELECT COALESCE(MAX(arrival_no), 0) + 1 INTO v_arrival_no 
    FROM mandi.arrivals WHERE organization_id = v_organization_id;

    -- Extract metadata for history summary
    v_first_item := p_arrival->'items'->0;
    IF v_first_item IS NOT NULL THEN
        v_metadata := jsonb_build_object(
            'item_name', (SELECT name FROM mandi.commodities WHERE id = (v_first_item->>'item_id')::UUID),
            'qty', (v_first_item->>'qty')::NUMERIC,
            'unit', COALESCE(v_first_item->>'unit', 'Box'),
            'supplier_rate', COALESCE((v_first_item->>'supplier_rate')::NUMERIC, 0)
        );
    END IF;

    -- Create arrival record
    INSERT INTO mandi.arrivals (
        organization_id, party_id, arrival_type, arrival_date,
        arrival_no, reference_no, vehicle_number, vehicle_type,
        driver_name, driver_mobile, guarantor,
        hire_charges, hamali_expenses, other_expenses,
        advance_amount, advance_payment_mode,
        idempotency_key, created_by, metadata, status
    ) VALUES (
        v_organization_id, v_party_id, v_arrival_type, (p_arrival->>'arrival_date')::DATE,
        v_arrival_no, p_arrival->>'reference_no', p_arrival->>'vehicle_number', p_arrival->>'vehicle_type',
        p_arrival->>'driver_name', p_arrival->>'driver_mobile', p_arrival->>'guarantor',
        COALESCE((p_arrival->>'hire_charges')::NUMERIC, 0),
        COALESCE((p_arrival->>'hamali_expenses')::NUMERIC, 0), 
        COALESCE((p_arrival->>'other_expenses')::NUMERIC, 0),
        v_advance_amount, v_advance_mode,
        v_idempotency_key, p_created_by, v_metadata, 'pending'
    ) RETURNING id INTO v_arrival_id;

    -- Create lots with FULL metadata
    FOR v_lot IN SELECT value FROM jsonb_array_elements(p_arrival->'items')
    LOOP
        INSERT INTO mandi.lots (
            organization_id, arrival_id, item_id, contact_id,
            lot_code, initial_qty, current_qty, unit, unit_weight,
            supplier_rate, commission_percent, 
            less_percent, less_units, packing_cost, loading_cost, farmer_charges,
            arrival_type, status, 
            advance, advance_payment_mode,
            created_by
        ) VALUES (
            v_organization_id, v_arrival_id, (v_lot.value->>'item_id')::UUID, v_party_id,
            COALESCE(v_lot.value->>'lot_code', 'LOT-' || COALESCE(v_arrival_no::TEXT, '') || '-' || substr(gen_random_uuid()::text, 1, 4)),
            (v_lot.value->>'qty')::NUMERIC, (v_lot.value->>'qty')::NUMERIC, 
            COALESCE(v_lot.value->>'unit', 'Box'), 
            COALESCE((v_lot.value->>'unit_weight')::NUMERIC, 1),
            COALESCE((v_lot.value->>'supplier_rate')::NUMERIC, 0),
            COALESCE((v_lot.value->>'commission_percent')::NUMERIC, 0),
            COALESCE((v_lot.value->>'less_percent')::NUMERIC, 0),
            COALESCE((v_lot.value->>'less_units')::NUMERIC, 0),
            COALESCE((v_lot.value->>'packing_cost')::NUMERIC, 0),
            COALESCE((v_lot.value->>'loading_cost')::NUMERIC, 0),
            COALESCE((v_lot.value->>'farmer_charges')::NUMERIC, 0),
            v_arrival_type, 'available',
            CASE WHEN jsonb_array_length(p_arrival->'items') = 1 THEN v_advance_amount ELSE 0 END,
            CASE WHEN jsonb_array_length(p_arrival->'items') = 1 THEN v_advance_mode ELSE 'cash' END,
            p_created_by
        ) RETURNING id INTO v_lot_id;

        -- Store pre-calculated weight
        UPDATE mandi.lots SET total_weight = initial_qty * unit_weight WHERE id = v_lot_id;

        -- Compute snapshot of net_payable
        v_net_payable := mandi.compute_lot_net_payable(v_lot_id);
        UPDATE mandi.lots SET net_payable = v_net_payable WHERE id = v_lot_id;
    END LOOP;

    -- Record advance payment if applicable
    IF v_advance_amount > 0 AND v_party_id IS NOT NULL THEN
        INSERT INTO mandi.payments (
            organization_id, party_id, arrival_id, amount,
            payment_type, payment_mode, payment_date,
            reference_number, idempotency_key, created_by
        ) VALUES (
            v_organization_id, v_party_id, v_arrival_id, v_advance_amount,
            'payment', v_advance_mode, (p_arrival->>'arrival_date')::DATE,
            COALESCE(p_arrival->>'reference_no', v_arrival_no::TEXT), v_idempotency_key, p_created_by
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    -- Finalize ledger
    PERFORM mandi.post_arrival_ledger(v_arrival_id);

    RETURN jsonb_build_object(
        'success', true, 
        'arrival_id', v_arrival_id,
        'arrival_no', v_arrival_no,
        'metadata', v_metadata
    );
END;
$function$;

-- 4. REPAIR RPC: confirm_purchase_transaction (Handles final settlement)
CREATE OR REPLACE FUNCTION mandi.confirm_purchase_transaction(
    p_lot_id UUID,
    p_organization_id UUID,
    p_payment_mode TEXT,
    p_advance_amount NUMERIC,
    p_bank_account_id UUID DEFAULT NULL,
    p_cheque_no TEXT DEFAULT NULL,
    p_cheque_date DATE DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
    v_lot RECORD;
    v_arrival_id UUID;
    v_voucher_id UUID;
BEGIN
    -- 1. Update Lot with any final metadata changes
    UPDATE mandi.lots SET
        packing_cost = COALESCE((p_metadata->>'packing_cost')::NUMERIC, packing_cost),
        loading_cost = COALESCE((p_metadata->>'loading_cost')::NUMERIC, loading_cost),
        farmer_charges = COALESCE((p_metadata->>'farmer_charges')::NUMERIC, farmer_charges),
        commission_percent = COALESCE((p_metadata->>'commission_percent')::NUMERIC, commission_percent),
        supplier_rate = COALESCE((p_metadata->>'supplier_rate')::NUMERIC, supplier_rate),
        advance = p_advance_amount,
        advance_payment_mode = p_payment_mode,
        advance_bank_account_id = p_bank_account_id,
        advance_cheque_no = p_cheque_no,
        advance_cheque_date = p_cheque_date,
        status = 'confirmed',
        updated_at = NOW()
    WHERE id = p_lot_id AND organization_id = p_organization_id
    RETURNING arrival_id INTO v_arrival_id;

    -- 2. Recalculate Net Payable Snapshot
    UPDATE mandi.lots SET net_payable = mandi.compute_lot_net_payable(p_lot_id) WHERE id = p_lot_id;

    -- 3. Post to Ledger
    PERFORM mandi.post_arrival_ledger(v_arrival_id);

    RETURN jsonb_build_object('success', true, 'lot_id', p_lot_id, 'arrival_id', v_arrival_id);
END;
$$ LANGUAGE plpgsql;

-- 5. Fix compute_lot_net_payable to ensure total weight and less units are handled
CREATE OR REPLACE FUNCTION mandi.compute_lot_net_payable(p_lot_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
DECLARE
    v_lot          RECORD;
    v_adjusted_qty NUMERIC;
    v_base_value   NUMERIC;
    v_commission   NUMERIC;
    v_expenses     NUMERIC;
    v_sales_sum    NUMERIC;
    v_goods_value  NUMERIC;
BEGIN
    SELECT
        l.initial_qty,
        l.supplier_rate,
        l.less_percent,
        l.less_units,
        l.farmer_charges,
        l.packing_cost,
        l.loading_cost,
        l.commission_percent,
        COALESCE(l.arrival_type, arr.arrival_type, 'direct') AS arrival_type,
        COALESCE(
            (SELECT SUM(si.amount) FROM mandi.sale_items si WHERE si.lot_id = l.id),
            0
        ) AS sales_sum
    INTO v_lot
    FROM mandi.lots l
    LEFT JOIN mandi.arrivals arr ON arr.id = l.arrival_id
    WHERE l.id = p_lot_id;

    IF NOT FOUND THEN RETURN 0; END IF;

    -- Adjusted quantity (less by weight/percent)
    v_adjusted_qty := COALESCE(v_lot.initial_qty, 0)
                    - COALESCE(v_lot.less_units, 0)
                    - (COALESCE(v_lot.initial_qty, 0) * COALESCE(v_lot.less_percent, 0) / 100.0);
    
    v_base_value  := v_adjusted_qty * COALESCE(v_lot.supplier_rate, 0);
    v_expenses    := COALESCE(v_lot.packing_cost, 0) + COALESCE(v_lot.loading_cost, 0);

    IF v_lot.arrival_type = 'direct' THEN
        RETURN GREATEST(0, v_base_value - COALESCE(v_lot.farmer_charges, 0));
    END IF;

    -- Commission purchase: use actual sales if available
    v_sales_sum    := COALESCE(v_lot.sales_sum, 0);
    v_goods_value  := CASE WHEN v_sales_sum > 0 THEN v_sales_sum ELSE v_base_value END;
    v_commission   := v_goods_value * COALESCE(v_lot.commission_percent, 0) / 100.0;

    RETURN GREATEST(0,
        v_goods_value
        - v_commission
        - COALESCE(v_lot.farmer_charges, 0)
        - v_expenses
    );
END;
$$;

-- 6. Update seed_default_field_configs to include new metadata fields
CREATE OR REPLACE FUNCTION seed_default_field_configs(p_org_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO field_configs (organization_id, module_id, field_key, label, field_type, default_value, is_visible, is_mandatory, display_order)
  VALUES
    (p_org_id, 'arrivals_direct', 'farmer_charges', 'Other Cut (₹)', 'number', '0', true, false, 41),
    (p_org_id, 'arrivals_farmer', 'farmer_charges', 'Other Cut (₹)', 'number', '0', true, false, 41),
    (p_org_id, 'arrivals_supplier', 'farmer_charges', 'Other Cut (₹)', 'number', '0', true, false, 41),
    (p_org_id, 'arrivals_direct', 'barcode', 'Barcode / Tag', 'text', NULL, true, false, 50),
    (p_org_id, 'arrivals_farmer', 'barcode', 'Barcode / Tag', 'text', NULL, true, false, 50)
  ON CONFLICT (organization_id, module_id, field_key) DO UPDATE
  SET is_visible = EXCLUDED.is_visible, label = EXCLUDED.label;
END;
$$ LANGUAGE plpgsql;

-- Apply seed to existing orgs (optional but helpful)
SELECT seed_default_field_configs(id) FROM core.organizations;

COMMIT;

