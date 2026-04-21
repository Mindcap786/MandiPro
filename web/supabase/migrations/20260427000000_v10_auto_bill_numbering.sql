-- Phase 1: Auto-Bill Numbering Infrastructure

-- 1. Function to get the next sequential bill number for an organization
CREATE OR REPLACE FUNCTION mandi.get_next_bill_no(p_organization_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_next_no bigint;
BEGIN
    SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_next_no
    FROM mandi.arrivals
    WHERE organization_id = p_organization_id;
    
    RETURN v_next_no;
END;
$$;

-- 2. Update create_mixed_arrival to handle bill_no
CREATE OR REPLACE FUNCTION mandi.create_mixed_arrival(p_arrival jsonb, p_created_by uuid DEFAULT NULL::uuid)
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
    v_ledger_result   JSONB;
    v_lot_net         NUMERIC;
    v_arrival_type    TEXT;
    v_commission_pct  NUMERIC;
    v_metadata        JSONB := '{}'::jsonb;
    v_first_item      JSONB;
    v_bill_no         BIGINT;
BEGIN
    v_organization_id := (p_arrival->>'organization_id')::UUID;
    v_party_id        := (p_arrival->>'party_id')::UUID;
    v_advance_amount  := COALESCE((p_arrival->>'advance')::NUMERIC, 0);
    v_advance_mode    := COALESCE(p_arrival->>'advance_payment_mode', 'cash');
    v_arrival_type    := COALESCE(p_arrival->>'arrival_type', 'commission');

    -- Handle bill_no (Prioritize provided one, else auto-generate)
    v_bill_no := (p_arrival->>'bill_no')::BIGINT;
    IF v_bill_no IS NULL THEN
        v_bill_no := mandi.get_next_bill_no(v_organization_id);
    END IF;

    BEGIN
        v_idempotency_key := (p_arrival->>'idempotency_key')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_idempotency_key := NULL;
    END;

    IF v_organization_id IS NULL THEN
        RAISE EXCEPTION 'organization_id is required';
    END IF;

    IF v_party_id IS NULL THEN
        RAISE EXCEPTION 'Supplier/Party is required to process this transaction. Unknown Supplier is not permitted.';
    END IF;

    -- Idempotency check
    IF v_idempotency_key IS NOT NULL THEN
        SELECT id, COALESCE(metadata, '{}'::jsonb) INTO v_arrival_id, v_metadata 
        FROM mandi.arrivals 
        WHERE idempotency_key = v_idempotency_key AND organization_id = v_organization_id;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'arrival_id', v_arrival_id, 'idempotent', true, 'metadata', v_metadata);
        END IF;
    END IF;

    -- Extract metadata from first item for history summary
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
        vehicle_number, driver_name, driver_mobile,
        loaders_count, hire_charges, hamali_expenses, other_expenses,
        advance_amount, advance_payment_mode, reference_no, bill_no,
        idempotency_key, created_by, metadata
    ) VALUES (
        v_organization_id, v_party_id, v_arrival_type, (p_arrival->>'arrival_date')::DATE,
        p_arrival->>'vehicle_number', p_arrival->>'driver_name', p_arrival->>'driver_mobile',
        COALESCE((p_arrival->>'loaders_count')::INT, 0), 
        COALESCE((p_arrival->>'hire_charges')::NUMERIC, 0),
        COALESCE((p_arrival->>'hamali_expenses')::NUMERIC, 0), 
        COALESCE((p_arrival->>'other_expenses')::NUMERIC, 0),
        v_advance_amount, v_advance_mode, p_arrival->>'reference_no', v_bill_no,
        v_idempotency_key, p_created_by, v_metadata
    ) RETURNING id INTO v_arrival_id;

    -- Create lots
    FOR v_lot IN SELECT value FROM jsonb_array_elements(p_arrival->'items')
    LOOP
        v_commission_pct := COALESCE((v_lot.value->>'commission_percent')::NUMERIC, 0);
        
        INSERT INTO mandi.lots (
            organization_id, arrival_id, item_id, contact_id,
            lot_code, initial_qty, current_qty, unit, supplier_rate,
            commission_percent, arrival_type, status, 
            advance, advance_payment_mode,
            created_by
        ) VALUES (
            v_organization_id, v_arrival_id, (v_lot.value->>'item_id')::UUID, v_party_id,
            COALESCE(v_lot.value->>'lot_code', 'LOT-' || COALESCE(v_bill_no::text, '') || '-' || substr(gen_random_uuid()::text, 1, 4)),
            (v_lot.value->>'qty')::NUMERIC, (v_lot.value->>'qty')::NUMERIC, 
            COALESCE(v_lot.value->>'unit', 'Box'), 
            COALESCE((v_lot.value->>'supplier_rate')::NUMERIC, 0),
            v_commission_pct, v_arrival_type, 'available',
            CASE WHEN jsonb_array_length(p_arrival->'items') = 1 THEN v_advance_amount ELSE 0 END,
            CASE WHEN jsonb_array_length(p_arrival->'items') = 1 THEN v_advance_mode ELSE 'cash' END,
            p_created_by
        ) RETURNING id INTO v_lot_id;

        -- Compute and store net_payable on lot immediately
        v_lot_net := mandi.compute_lot_net_payable(v_lot_id);
        
        UPDATE mandi.lots
        SET net_payable    = v_lot_net,
            payment_status = CASE
                WHEN v_lot_net <= 0.01                        THEN 'pending'
                WHEN jsonb_array_length(p_arrival->'items') = 1 THEN
                    CASE
                        WHEN v_advance_mode NOT IN ('cash', 'bank', 'upi') THEN 'pending'
                        WHEN ABS(v_lot_net - v_advance_amount) < 0.01     THEN 'paid'
                        WHEN v_advance_amount > 0.01                       THEN 'partial'
                        ELSE 'pending'
                    END
                ELSE 'pending'
            END
        WHERE id = v_lot_id;
    END LOOP;

    -- Record payment in mandi.payments (for ledger reference)
    IF v_advance_amount > 0 AND v_party_id IS NOT NULL THEN
        INSERT INTO mandi.payments (
            organization_id, party_id, arrival_id, amount,
            payment_type, payment_mode, payment_date,
            reference_number, idempotency_key, created_by
        ) VALUES (
            v_organization_id, v_party_id, v_arrival_id, v_advance_amount,
            'payment', v_advance_mode, (p_arrival->>'arrival_date')::DATE,
            COALESCE(p_arrival->>'reference_no', v_bill_no::text), v_idempotency_key, p_created_by
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    -- Post ledger entries
    DECLARE
        v_has_rate BOOLEAN;
    BEGIN
        SELECT EXISTS(
            SELECT 1 FROM mandi.lots 
            WHERE arrival_id = v_arrival_id AND supplier_rate > 0
        ) INTO v_has_rate;

        IF v_has_rate AND v_party_id IS NOT NULL THEN
            PERFORM mandi.post_arrival_ledger(v_arrival_id);
            v_ledger_result := '{"status": "posted"}'::jsonb;
        END IF;
    END;

    RETURN jsonb_build_object(
        'success', true, 
        'arrival_id', v_arrival_id,
        'ledger_posted', v_ledger_result,
        'bill_no', v_bill_no,
        'metadata', v_metadata
    );
END;
$function$;

-- 3. Update post_arrival_ledger for better narrations
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

    -- Account lookups
    v_ap_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = v_arrival.organization_id AND account_sub_type = 'accounts_payable' ORDER BY created_at LIMIT 1);
    IF v_ap_acc_id IS NULL THEN
        v_ap_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = v_arrival.organization_id AND type = 'liability' AND name ILIKE '%Payable%' LIMIT 1);
    END IF;

    v_inventory_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = v_arrival.organization_id AND account_sub_type = 'inventory' LIMIT 1);
    IF v_inventory_acc_id IS NULL THEN
        v_inventory_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = v_arrival.organization_id AND type = 'asset' AND name ILIKE '%Stock%' LIMIT 1);
    END IF;

    IF v_ap_acc_id IS NULL OR v_inventory_acc_id IS NULL THEN RETURN; END IF;

    -- PART 1: PURCHASE VOUCHER
    SELECT id INTO v_purchase_vch_id FROM mandi.vouchers
    WHERE arrival_id = p_arrival_id AND type = 'purchase' LIMIT 1;

    IF v_purchase_vch_id IS NULL THEN
        FOR v_lot IN
            SELECT l.*, c.name AS item_name FROM mandi.lots l
            JOIN mandi.commodities c ON l.item_id = c.id
            WHERE l.arrival_id = p_arrival_id
        LOOP
            v_lot_details := v_lot_details || v_lot.item_name || ' (' || v_lot.initial_qty || ' @ Rs.' || v_lot.supplier_rate || ') ';
            v_arrival_total := v_arrival_total + COALESCE(v_lot.net_payable, 0);
        END LOOP;

        v_narration := 'Purchase - Bill #' || COALESCE(v_arrival.bill_no::text, v_arrival.reference_no, '-') || ' | Items: ' || TRIM(v_lot_details);

        IF v_arrival_total > 0 THEN
            INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, arrival_id)
            VALUES (v_arrival.organization_id, v_arrival.arrival_date, 'purchase',
                (SELECT COALESCE(MAX(voucher_no),0)+1 FROM mandi.vouchers WHERE organization_id = v_arrival.organization_id AND type = 'purchase'),
                v_arrival_total, v_narration, p_arrival_id)
            RETURNING id INTO v_purchase_vch_id;

            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_arrival.organization_id, v_purchase_vch_id, v_inventory_acc_id, NULL,
                    v_arrival_total, 0, v_arrival.arrival_date, v_narration, 'purchase', p_arrival_id);

            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_arrival.organization_id, v_purchase_vch_id, v_ap_acc_id, v_arrival.party_id,
                    0, v_arrival_total, v_arrival.arrival_date, v_narration, 'purchase', p_arrival_id);
        END IF;
    END IF;

    -- PART 2: ADVANCE PAYMENT
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

-- 4. Update post_arrival_advance_payment for better narrations
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
    v_arrival_ref      TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM mandi.vouchers WHERE arrival_id = p_arrival_id AND type = 'payment') THEN RETURN; END IF;

    IF p_payment_mode = 'cash' THEN
        v_cash_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = p_organization_id AND account_sub_type = 'cash' LIMIT 1);
    ELSE
        v_cash_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = p_organization_id AND account_sub_type = 'bank' LIMIT 1);
    END IF;
    
    IF v_cash_acc_id IS NULL OR p_ap_acc_id IS NULL THEN RETURN; END IF;

    SELECT COALESCE(bill_no::text, reference_no, '-') INTO v_arrival_ref FROM mandi.arrivals WHERE id = p_arrival_id;
    v_pay_narration := 'Payment Paid - Bill #' || v_arrival_ref || ' (' || p_payment_mode || ')';

    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, arrival_id, payment_mode)
    VALUES (p_organization_id, p_created_at::date, 'payment',
        (SELECT COALESCE(MAX(voucher_no),0)+1 FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'payment'),
        p_advance_amount, v_pay_narration, p_arrival_id, p_payment_mode
    ) RETURNING id INTO v_payment_vch_id;

    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (p_organization_id, v_payment_vch_id, p_ap_acc_id, p_party_id,
            p_advance_amount, 0, p_created_at::date, v_pay_narration, 'purchase_payment', p_arrival_id);

    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (p_organization_id, v_payment_vch_id, v_cash_acc_id, NULL,
            0, p_advance_amount, p_created_at::date, v_pay_narration, 'purchase_payment', p_arrival_id);
END;
$fn$;
