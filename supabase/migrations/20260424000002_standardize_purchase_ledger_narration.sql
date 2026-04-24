-- Standardize Ledger Narrations for Purchase Bills
BEGIN;

CREATE OR REPLACE FUNCTION mandi.sync_arrival_to_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mandi', 'public'
AS $function$
DECLARE
    v_purchase_acc_id UUID;
    v_ap_acc_id UUID;
    v_comm_income_acc_id UUID;
    v_recovery_acc_id UUID;
    v_gross_purchase NUMERIC := 0;
    v_total_expenses NUMERIC := 0;
    v_net_payable NUMERIC := 0;
    v_total_comm NUMERIC := 0;
    v_item_details TEXT;
    v_type_label TEXT;
    v_narration TEXT;
BEGIN
    -- 1. Resolve Accounts
    v_purchase_acc_id := mandi.resolve_account_consolidated(NEW.organization_id, 'cost_of_goods', '%Purchase%', '5001');
    v_ap_acc_id := mandi.resolve_account_consolidated(NEW.organization_id, 'payable', '%Payable%', '2100');
    v_comm_income_acc_id := mandi.resolve_account_consolidated(NEW.organization_id, 'commission', '%Commission%', '4003');
    v_recovery_acc_id := mandi.resolve_account_consolidated(NEW.organization_id, 'fees', '%Recovery%', '4002');

    -- 2. Aggregate lot-level financials and build item details
    SELECT 
        SUM(COALESCE(gross_amount, initial_qty * supplier_rate, 0)),
        SUM(COALESCE(packing_cost, 0) + COALESCE(loading_cost, 0)),
        SUM(COALESCE(net_payable, 0)),
        SUM(COALESCE(commission_amount, 0)),
        string_agg(
            format('%s (%s, %s %s @ Rs.%s)', 
                c.name, l.lot_code, l.initial_qty, l.unit, l.supplier_rate
            ), 
            ' | '
        )
    INTO v_gross_purchase, v_total_expenses, v_net_payable, v_total_comm, v_item_details
    FROM mandi.lots l
    JOIN mandi.commodities c ON l.item_id = c.id
    WHERE l.arrival_id = NEW.id;

    -- 3. Determine Label based on Arrival Type
    v_type_label := CASE 
        WHEN NEW.arrival_type = 'direct' THEN 'Net Cost'
        WHEN NEW.arrival_type = 'commission' THEN 'Farmer gets'
        WHEN NEW.arrival_type = 'commission_supplier' THEN 'Supplier gets'
        ELSE 'Total Payable'
    END;

    -- 4. Build Final Narration
    -- Format: Purchase #BillNo | item name (lot no, qty @ Rs.price). [Label]: [Amount]
    v_narration := format('Purchase #%s | %s. %s: %s', 
        COALESCE(NEW.contact_bill_no::text, NEW.bill_no::text), 
        v_item_details,
        v_type_label,
        v_net_payable
    );

    -- 5. Clean existing (Idempotency)
    DELETE FROM mandi.ledger_entries WHERE reference_id = NEW.id AND transaction_type = 'purchase';

    -- 6. Post DR Purchase / CR Party / CR Income / CR Recovery
    
    -- DR Purchase Account
    IF NEW.arrival_type = 'direct' THEN
        -- Direct: Mandi buys goods + pays for packing/loading
        INSERT INTO mandi.ledger_entries (organization_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
        VALUES (NEW.organization_id, v_purchase_acc_id, v_gross_purchase + v_total_expenses, 0, NEW.arrival_date, v_narration, 'purchase', NEW.id);
    ELSE
        -- Commission: Mandi records the gross purchase value
        INSERT INTO mandi.ledger_entries (organization_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
        VALUES (NEW.organization_id, v_purchase_acc_id, v_gross_purchase, 0, NEW.arrival_date, v_narration, 'purchase', NEW.id);
    END IF;
    
    -- CR Accounts Payable (Party)
    INSERT INTO mandi.ledger_entries (organization_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
    VALUES (NEW.organization_id, NEW.party_id, v_ap_acc_id, 0, v_net_payable, NEW.arrival_date, v_narration, 'purchase', NEW.id);
    
    -- CR Commission Income (if any)
    IF v_total_comm > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
        VALUES (NEW.organization_id, v_comm_income_acc_id, 0, v_total_comm, NEW.arrival_date, 'Commission Income #' || NEW.bill_no, 'purchase', NEW.id);
    END IF;

    -- CR Charges Recovery (Balancing Figure)
    IF NEW.arrival_type = 'direct' THEN
        IF (v_gross_purchase + v_total_expenses - v_net_payable) > 0 THEN
            INSERT INTO mandi.ledger_entries (organization_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
            VALUES (NEW.organization_id, v_recovery_acc_id, 0, (v_gross_purchase + v_total_expenses - v_net_payable), NEW.arrival_date, 'Charges Recovery #' || NEW.bill_no, 'purchase', NEW.id);
        END IF;
    ELSE
        IF (v_gross_purchase - v_net_payable - v_total_comm) > 0 THEN
            INSERT INTO mandi.ledger_entries (organization_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
            VALUES (NEW.organization_id, v_recovery_acc_id, 0, (v_gross_purchase - v_net_payable - v_total_comm), NEW.arrival_date, 'Charges Recovery #' || NEW.bill_no, 'purchase', NEW.id);
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- Update record_quick_purchase to use "Payment Purchase #" instead of "Advance against Arrival #"
CREATE OR REPLACE FUNCTION mandi.record_quick_purchase(
    p_org_id UUID,
    p_party_id UUID,
    p_arrival_date DATE,
    p_notes TEXT DEFAULT '',
    p_vehicle_number TEXT DEFAULT '',
    p_lot_no TEXT DEFAULT '',
    p_storage_location TEXT DEFAULT '',
    p_vehicle_type TEXT DEFAULT '',
    p_guarantor TEXT DEFAULT '',
    p_driver_name TEXT DEFAULT '',
    p_driver_mobile TEXT DEFAULT '',
    p_loading_amount NUMERIC DEFAULT 0,
    p_advance_amount NUMERIC DEFAULT 0,
    p_other_expenses NUMERIC DEFAULT 0,
    p_payment_mode TEXT DEFAULT 'credit',
    p_lots JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
DECLARE
    v_arrival_id UUID;
    v_lot JSONB;
    v_bill_no BIGINT;
    v_contact_bill_no BIGINT;
    v_idx INTEGER := 0;
    v_lot_code TEXT;
    v_arrival_type TEXT;
BEGIN
    -- 1. Consume sequences
    v_bill_no := mandi.get_internal_sequence(p_org_id, 'bill_no');
    v_contact_bill_no := mandi.next_contact_bill_no(p_org_id, p_party_id, 'purchase');

    -- Derive arrival_type from first lot if available
    v_arrival_type := COALESCE((p_lots->0->>'arrival_type'), 'direct');

    -- 2. Create Header Arrival record
    INSERT INTO mandi.arrivals (
        organization_id, party_id, arrival_date, arrival_type, bill_no, contact_bill_no,
        vehicle_number, lot_no, storage_location, 
        vehicle_type, guarantor, driver_name, driver_mobile,
        trip_loading_amount, advance_amount, trip_other_expenses,
        advance_payment_mode, status, notes
    ) VALUES (
        p_org_id, p_party_id, p_arrival_date, v_arrival_type, v_bill_no, v_contact_bill_no,
        p_vehicle_number, p_lot_no, p_storage_location,
        p_vehicle_type, p_guarantor, p_driver_name, p_driver_mobile,
        p_loading_amount, p_advance_amount, p_other_expenses,
        p_payment_mode, 'completed', p_notes
    ) RETURNING id INTO v_arrival_id;

    -- 3. Create Child Lot records
    FOR v_lot IN SELECT * FROM jsonb_array_elements(p_lots)
    LOOP
        v_idx := v_idx + 1;
        v_lot_code := 'LOT-' || v_bill_no || '-' || v_idx;

        INSERT INTO mandi.lots (
            organization_id, arrival_id, contact_id, item_id, 
            lot_code, initial_qty, current_qty, unit, supplier_rate, 
            commission_percent, less_units,
            packing_cost, loading_cost, other_cut,
            arrival_type, advance, advance_payment_mode,
            status
        ) VALUES (
            p_org_id, v_arrival_id, p_party_id, (v_lot->>'item_id')::UUID,
            v_lot_code, (v_lot->>'qty')::NUMERIC, (v_lot->>'qty')::NUMERIC, COALESCE(v_lot->>'unit', 'Box'), (v_lot->>'rate')::NUMERIC,
            COALESCE((v_lot->>'commission')::NUMERIC, 0), COALESCE((v_lot->>'less_units')::NUMERIC, 0),
            COALESCE((v_lot->>'packing_cost')::NUMERIC, 0), COALESCE((v_lot->>'loading_cost')::NUMERIC, 0), COALESCE((v_lot->>'other_cut')::NUMERIC, 0),
            COALESCE(v_lot->>'arrival_type', v_arrival_type),
            CASE WHEN v_idx = 1 THEN p_advance_amount ELSE 0 END,
            CASE WHEN v_idx = 1 THEN p_payment_mode ELSE 'credit' END,
            'active'
        );
    END LOOP;

    -- 4. Post Ledger (Wait, record_quick_purchase doesn't call post_arrival_ledger anymore? It uses triggers.)
    -- Actually, it still might need it for status calculation if not handled by triggers.
    -- But our trigger trg_sync_arrival_ledger handles the ledger part.

    -- Handle Advance Payment (Standardized Narration)
    IF p_advance_amount > 0 THEN
        INSERT INTO mandi.vouchers (
            organization_id, party_id, contact_id, date, amount, type, 
            narration, advance_payment_mode, arrival_id
        ) VALUES (
            p_org_id, p_party_id, p_party_id, p_arrival_date, p_advance_amount, 'payment',
            'Payment Purchase #' || v_bill_no, p_payment_mode, v_arrival_id
        );
    END IF;

    -- 5. Return summary
    RETURN jsonb_build_object(
        'success', true, 
        'arrival_id', v_arrival_id,
        'bill_no', v_bill_no,
        'contact_bill_no', v_contact_bill_no
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

COMMIT;
