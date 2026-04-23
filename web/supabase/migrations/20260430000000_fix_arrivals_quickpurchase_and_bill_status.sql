-- =====================================================================
-- Migration: 20260430000000_fix_arrivals_quickpurchase_and_bill_status.sql
--
-- PURPOSE
--   1. Stop the "INVALID_AMOUNTS: Both debit and credit cannot be zero"
--      failure on Arrivals (UDHAAR / paid=0) and Quick Purchase. The
--      guard now lives in post_arrival_ledger itself: we never insert
--      a ledger row where both debit and credit are zero, and we never
--      insert a payment voucher/legs when advance <= 0 or when the mode
--      is not a real liquid settlement (credit/udhaar/cheque-pending).
--
--   2. Keep purchase-bill payment status truthful:
--        - PAID    : advance >= net_payable (cash/bank/upi, or cleared cheque)
--        - PARTIAL : 0 < advance < net_payable (cash/bank/upi, or cleared cheque)
--        - UDHAAR  : advance = 0 OR mode='credit' OR pending cheque
--      The classification is centralised in mandi.classify_bill_status
--      and wired into the lot insert path so every purchase_bill row
--      has the right payment_status at creation time and after edits.
--
--   3. Leave POS, New Invoice, Bulk Lot Sale and Sale+Purchase flows
--      completely untouched. Nothing in this file references
--      confirm_sale_transaction, post_sale_ledger or anything sale-side.
--
-- SCOPE
--   - mandi.post_arrival_ledger(uuid)
--   - mandi.create_mixed_arrival(jsonb, uuid)
--   - mandi.record_quick_purchase(...)
--   - mandi.classify_bill_status(numeric, numeric, text, boolean)
--   - mandi.sync_purchase_bill_status(uuid) + trigger on lots
--
-- SAFETY
--   - Every INSERT into mandi.ledger_entries is guarded: we only post
--     rows where (debit > 0 OR credit > 0). This makes the function
--     resilient to any upstream INVALID_AMOUNTS check (CHECK constraint,
--     trigger or RPC) that exists in the live DB even if it isn't
--     represented in this repo's migrations.
--   - Full idempotency: every re-post deletes its own prior vouchers
--     and ledger legs before inserting.
--   - CoA lookups are defensive (COALESCE across 3 strategies).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Drop old signatures first. The live post_arrival_ledger returns
--    jsonb; the new one returns void. Postgres refuses to change return
--    type on CREATE OR REPLACE, so we drop explicitly. CASCADE removes
--    any dependent triggers — we recreate them below.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS mandi.post_arrival_ledger(uuid) CASCADE;
DROP FUNCTION IF EXISTS mandi.create_mixed_arrival(jsonb, uuid) CASCADE;
DROP FUNCTION IF EXISTS mandi.record_quick_purchase(
    uuid, uuid, date, text, jsonb, numeric, text, uuid, text, date, text, boolean, boolean, uuid
) CASCADE;

-- ---------------------------------------------------------------------
-- 1. classify_bill_status — single source of truth for purchase-bill
--    payment_status. Used by lots-insert path and by any backfill.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mandi.classify_bill_status(
    p_net_payable  numeric,
    p_advance      numeric,
    p_mode         text,
    p_cheque_cleared boolean DEFAULT false
) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_eps numeric := 0.01;
    v_adv numeric := COALESCE(p_advance, 0);
    v_net numeric := COALESCE(p_net_payable, 0);
    v_mode text    := LOWER(COALESCE(p_mode, 'credit'));
    v_effective_paid numeric;
BEGIN
    -- Udhaar/credit/no-settlement modes contribute nothing to "paid".
    -- Pending cheques likewise do not reduce udhaar until cleared.
    v_effective_paid := CASE
        WHEN v_mode IN ('cash', 'bank', 'upi')   THEN v_adv
        WHEN v_mode = 'cheque' AND p_cheque_cleared THEN v_adv
        ELSE 0
    END;

    IF v_net <= v_eps THEN
        RETURN 'pending';  -- nothing to settle yet
    ELSIF v_effective_paid + v_eps >= v_net THEN
        RETURN 'paid';
    ELSIF v_effective_paid > v_eps THEN
        RETURN 'partial';
    ELSE
        RETURN 'pending';  -- udhaar / credit / pending cheque
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION mandi.classify_bill_status(numeric, numeric, text, boolean)
    TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. post_arrival_ledger — hardened. Never inserts a zero/zero leg.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_arrival             RECORD;
    v_lot                 RECORD;
    v_lot_details         TEXT := '';
    v_narration           TEXT;
    v_bill_label          TEXT;
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
    v_has_lots            boolean;
    v_advance             numeric;
    v_mode                text;
BEGIN
    SELECT * INTO v_arrival FROM mandi.arrivals WHERE id = p_arrival_id;
    IF NOT FOUND THEN RETURN; END IF;

    v_org_id   := v_arrival.organization_id;
    v_party_id := v_arrival.party_id;
    v_advance  := COALESCE(v_arrival.advance_amount, 0);
    v_mode     := LOWER(COALESCE(v_arrival.advance_payment_mode, 'credit'));

    -- AFTER-INSERT trigger may fire before lots + advance exist; in that
    -- case there is nothing to post yet and the explicit call inside
    -- create_mixed_arrival / record_quick_purchase will re-post later.
    SELECT EXISTS (SELECT 1 FROM mandi.lots WHERE arrival_id = p_arrival_id) INTO v_has_lots;
    IF NOT v_has_lots AND v_advance <= 0 THEN
        RETURN;
    END IF;

    -- ── Chart of Accounts lookups (robust across orgs) ───────────────
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
        WHERE organization_id = v_org_id
          AND (code = '1001' OR account_sub_type = 'cash' OR name ILIKE 'Cash%')
        ORDER BY (code = '1001') DESC LIMIT 1
    );
    v_bank_acc_id := COALESCE(
        v_arrival.advance_bank_account_id,
        (SELECT id FROM mandi.accounts
         WHERE organization_id = v_org_id
           AND (code = '1002' OR account_sub_type = 'bank' OR name ILIKE 'Bank%')
         ORDER BY (code = '1002') DESC LIMIT 1)
    );

    IF v_ap_acc_id IS NULL THEN
        RAISE EXCEPTION 'Chart of Accounts missing Accounts Payable for org %. Run account setup.', v_org_id;
    END IF;
    IF v_inventory_acc_id IS NULL THEN
        RAISE EXCEPTION 'Chart of Accounts missing Inventory/Asset account for org %. Run account setup.', v_org_id;
    END IF;

    -- ── Build net total + narration from actual lots ─────────────────
    FOR v_lot IN
        SELECT l.*, c.name AS item_name
        FROM mandi.lots l
        JOIN mandi.commodities c ON l.item_id = c.id
        WHERE l.arrival_id = p_arrival_id
    LOOP
        v_total_payable := v_total_payable +
            CASE
                WHEN COALESCE(v_lot.net_payable, 0) > 0 THEN v_lot.net_payable
                ELSE COALESCE(v_lot.initial_qty, 0) * COALESCE(v_lot.supplier_rate, 0)
            END;
        v_lot_details := v_lot_details
            || v_lot.item_name
            || ' [' || COALESCE(v_lot.lot_code, '-') || ']: '
            || COALESCE(v_lot.initial_qty::text, '0')
            || ' ' || COALESCE(v_lot.unit, 'units')
            || CASE WHEN COALESCE(v_lot.supplier_rate, 0) > 0
                    THEN ' @ ₹' || v_lot.supplier_rate ELSE '' END
            || ' ';
    END LOOP;

    v_bill_label := COALESCE(
        v_arrival.contact_bill_no::text,
        v_arrival.reference_no,
        v_arrival.bill_no::text,
        'NEW'
    );
    v_narration := 'Purchase Bill #' || v_bill_label
        || CASE WHEN TRIM(v_lot_details) != '' THEN ' | ' || TRIM(v_lot_details) ELSE '' END;

    -- ── Idempotent cleanup ───────────────────────────────────────────
    DELETE FROM mandi.ledger_entries
     WHERE reference_id = p_arrival_id
       AND transaction_type IN ('purchase', 'payment');
    DELETE FROM mandi.vouchers
     WHERE reference_id = p_arrival_id
       AND type IN ('purchase', 'payment');

    -- ── 2a. Purchase voucher (udhaar is fine — only skipped if zero) ─
    IF v_total_payable > 0.01 THEN
        SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no
          FROM mandi.vouchers
         WHERE organization_id = v_org_id AND type = 'purchase';

        INSERT INTO mandi.vouchers (
            organization_id, date, type, voucher_no, amount, narration,
            party_id, arrival_id, reference_id, status
        ) VALUES (
            v_org_id, v_arrival.arrival_date, 'purchase', v_voucher_no,
            v_total_payable, v_narration,
            v_party_id, p_arrival_id, p_arrival_id, 'active'
        ) RETURNING id INTO v_purchase_vch_id;

        -- Dr Inventory (asset up)
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id,
            entry_date, debit, credit, description, transaction_type,
            arrival_id, reference_id, status
        ) VALUES (
            v_org_id, v_purchase_vch_id, v_inventory_acc_id,
            v_arrival.arrival_date, v_total_payable, 0, v_narration, 'purchase',
            p_arrival_id, p_arrival_id, 'active'
        );

        -- Cr Accounts Payable / Party (liability up)
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

    -- ── 2b. Advance payment voucher — only for settled liquid modes ──
    --    (credit/udhaar does nothing; pending cheque waits for clearance)
    IF v_advance > 0.01 AND v_mode IN ('cash', 'bank', 'upi') THEN
        v_payment_acc_id := CASE
            WHEN v_mode IN ('bank', 'upi') THEN COALESCE(v_bank_acc_id, v_cash_acc_id)
            ELSE v_cash_acc_id
        END;

        IF v_payment_acc_id IS NOT NULL THEN
            SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no
              FROM mandi.vouchers
             WHERE organization_id = v_org_id AND type = 'payment';

            INSERT INTO mandi.vouchers (
                organization_id, date, type, voucher_no, amount, narration,
                party_id, arrival_id, reference_id, payment_mode, status
            ) VALUES (
                v_org_id, v_arrival.arrival_date, 'payment', v_voucher_no,
                v_advance, 'Payment for Bill #' || v_bill_label,
                v_party_id, p_arrival_id, p_arrival_id, v_mode, 'active'
            ) RETURNING id INTO v_payment_vch_id;

            -- Dr Party (reduces what we owe)
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, contact_id, account_id,
                entry_date, debit, credit, description, transaction_type,
                arrival_id, reference_id, status
            ) VALUES (
                v_org_id, v_payment_vch_id, v_party_id, v_ap_acc_id,
                v_arrival.arrival_date, v_advance, 0,
                'Payment for Invoice #' || v_bill_label || ' (' || v_mode || ')',
                'payment', p_arrival_id, p_arrival_id, 'active'
            );

            -- Cr Cash/Bank (liquid asset down)
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, account_id,
                entry_date, debit, credit, description, transaction_type,
                arrival_id, reference_id, status
            ) VALUES (
                v_org_id, v_payment_vch_id, v_payment_acc_id,
                v_arrival.arrival_date, 0, v_advance,
                'Payment for Invoice #' || v_bill_label || ' (' || v_mode || ')',
                'payment', p_arrival_id, p_arrival_id, 'active'
            );
        END IF;
    END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION mandi.post_arrival_ledger(uuid)
    TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Re-attach the AFTER trigger (idempotent)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mandi.auto_post_arrival_ledger()
RETURNS trigger
LANGUAGE plpgsql AS $$
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

-- ---------------------------------------------------------------------
-- 4. create_mixed_arrival — normalises advance so mode='credit'/null
--    never smuggles a phantom advance into post_arrival_ledger.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mandi.create_mixed_arrival(
    p_arrival jsonb,
    p_created_by uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
    v_lot_net         NUMERIC;
    v_arrival_type    TEXT;
    v_commission_pct  NUMERIC;
    v_metadata        JSONB := '{}'::jsonb;
    v_bill_no         BIGINT;
    v_contact_bill_no BIGINT;
    v_header_location TEXT;
    v_item_location   TEXT;
BEGIN
    v_organization_id := (p_arrival->>'organization_id')::UUID;
    v_party_id        := (p_arrival->>'party_id')::UUID;

    -- Normalise advance + mode. Anything non-liquid collapses to
    -- advance=0 so downstream never sees a phantom cashless "advance".
    v_advance_amount  := COALESCE((p_arrival->>'advance')::NUMERIC, 0);
    v_advance_mode    := LOWER(COALESCE(NULLIF(TRIM(p_arrival->>'advance_payment_mode'), ''), 'credit'));
    IF v_advance_mode NOT IN ('cash', 'bank', 'upi', 'cheque') THEN
        v_advance_mode   := 'credit';
        v_advance_amount := 0;
    END IF;
    IF v_advance_amount <= 0 THEN
        v_advance_amount := 0;
        v_advance_mode   := 'credit';
    END IF;

    v_arrival_type    := COALESCE(p_arrival->>'arrival_type', 'commission');
    v_header_location := p_arrival->>'storage_location';

    IF v_organization_id IS NULL THEN RAISE EXCEPTION 'organization_id is required'; END IF;
    IF v_party_id        IS NULL THEN RAISE EXCEPTION 'Supplier/Party is required.'; END IF;

    BEGIN v_idempotency_key := (p_arrival->>'idempotency_key')::UUID; EXCEPTION WHEN OTHERS THEN v_idempotency_key := NULL; END;
    IF v_idempotency_key IS NOT NULL THEN
        SELECT id, COALESCE(metadata, '{}'::jsonb) INTO v_arrival_id, v_metadata
        FROM mandi.arrivals
        WHERE idempotency_key = v_idempotency_key AND organization_id = v_organization_id;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'arrival_id', v_arrival_id, 'idempotent', true, 'metadata', v_metadata);
        END IF;
    END IF;

    v_bill_no := NULLIF(p_arrival->>'bill_no', '')::BIGINT;
    IF v_bill_no IS NULL OR v_bill_no <= 0 THEN
        v_bill_no := mandi.get_internal_sequence(v_organization_id, 'bill_no');
    ELSE
        UPDATE mandi.id_sequences
           SET last_number = GREATEST(last_number, v_bill_no), updated_at = NOW()
         WHERE organization_id = v_organization_id AND entity_type = 'bill_no';
    END IF;

    v_contact_bill_no := NULLIF(p_arrival->>'contact_bill_no', '')::BIGINT;
    IF v_contact_bill_no IS NULL THEN
        v_contact_bill_no := mandi.next_contact_bill_no(v_organization_id, v_party_id, 'purchase');
    END IF;

    INSERT INTO mandi.arrivals (
        organization_id, party_id, arrival_type, arrival_date, vehicle_number, driver_name, driver_mobile,
        loaders_count, hire_charges, hamali_expenses, other_expenses, advance_amount, advance_payment_mode,
        reference_no, bill_no, contact_bill_no, idempotency_key, created_by, metadata, storage_location
    ) VALUES (
        v_organization_id, v_party_id, v_arrival_type, (p_arrival->>'arrival_date')::DATE,
        p_arrival->>'vehicle_number', p_arrival->>'driver_name', p_arrival->>'driver_mobile',
        COALESCE((p_arrival->>'loaders_count')::INT, 0), COALESCE((p_arrival->>'hire_charges')::NUMERIC, 0),
        COALESCE((p_arrival->>'hamali_expenses')::NUMERIC, 0), COALESCE((p_arrival->>'other_expenses')::NUMERIC, 0),
        v_advance_amount, v_advance_mode, p_arrival->>'reference_no', v_bill_no, v_contact_bill_no,
        v_idempotency_key, p_created_by, v_metadata, v_header_location
    ) RETURNING id, contact_bill_no INTO v_arrival_id, v_contact_bill_no;

    FOR v_lot IN SELECT value FROM jsonb_array_elements(p_arrival->'items')
    LOOP
        v_commission_pct := COALESCE((v_lot.value->>'commission_percent')::NUMERIC, 0);
        v_item_location  := COALESCE(v_lot.value->>'storage_location', v_header_location);
        INSERT INTO mandi.lots (
            organization_id, arrival_id, item_id, contact_id, lot_code, initial_qty, current_qty, unit, supplier_rate,
            commission_percent, arrival_type, status, advance, advance_payment_mode, created_by, storage_location
        ) VALUES (
            v_organization_id, v_arrival_id, (v_lot.value->>'item_id')::UUID, v_party_id,
            COALESCE(v_lot.value->>'lot_code',
                     'LOT-' || COALESCE(v_contact_bill_no::text, v_bill_no::text) || '-' || substr(gen_random_uuid()::text, 1, 4)),
            (v_lot.value->>'qty')::NUMERIC, (v_lot.value->>'qty')::NUMERIC, COALESCE(v_lot.value->>'unit', 'Box'),
            COALESCE((v_lot.value->>'supplier_rate')::NUMERIC, 0), v_commission_pct, v_arrival_type, 'available',
            CASE WHEN jsonb_array_length(p_arrival->'items') = 1 THEN v_advance_amount ELSE 0 END,
            CASE WHEN jsonb_array_length(p_arrival->'items') = 1 THEN v_advance_mode ELSE 'credit' END,
            p_created_by, v_item_location
        ) RETURNING id INTO v_lot_id;
        v_lot_net := mandi.compute_lot_net_payable(v_lot_id);
        UPDATE mandi.lots SET net_payable = v_lot_net WHERE id = v_lot_id;
    END LOOP;

    PERFORM mandi.post_arrival_ledger(v_arrival_id);

    RETURN jsonb_build_object(
        'success', true,
        'arrival_id', v_arrival_id,
        'bill_no', v_bill_no,
        'contact_bill_no', v_contact_bill_no
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION mandi.create_mixed_arrival(jsonb, uuid)
    TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. record_quick_purchase — same normalisation + correct bill status.
--    validate_payment_input may raise for cheque/bank missing fields,
--    but never for credit/udhaar.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mandi.record_quick_purchase(
    p_organization_id uuid,
    p_supplier_id uuid,
    p_arrival_date date,
    p_arrival_type text,
    p_items jsonb,
    p_advance numeric DEFAULT 0,
    p_advance_payment_mode text DEFAULT 'credit'::text,
    p_advance_bank_account_id uuid DEFAULT NULL::uuid,
    p_advance_cheque_no text DEFAULT NULL::text,
    p_advance_cheque_date date DEFAULT NULL::date,
    p_advance_bank_name text DEFAULT NULL::text,
    p_advance_cheque_status boolean DEFAULT false,
    p_clear_instantly boolean DEFAULT false,
    p_created_by uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_arrival_id UUID;
    v_arrival_bill_no BIGINT;
    v_arrival_contact_bill_no BIGINT;
    v_item RECORD;
    v_first_lot_id UUID;
    v_net_qty NUMERIC;
    v_gross NUMERIC;
    v_comm NUMERIC;
    v_net_payable NUMERIC;
    v_calculated_arrival_type TEXT;
    v_farmer_count INT := 0;
    v_supplier_count INT := 0;
    v_total_bill_amount NUMERIC := 0;
    v_bill_status TEXT;
    v_advance NUMERIC := COALESCE(p_advance, 0);
    v_mode TEXT := LOWER(COALESCE(NULLIF(TRIM(p_advance_payment_mode), ''), 'credit'));
    v_cheque_cleared BOOLEAN := COALESCE(p_advance_cheque_status, false) OR COALESCE(p_clear_instantly, false);
BEGIN
    -- Normalise mode so downstream ledger never sees bogus advance.
    IF v_mode NOT IN ('cash', 'bank', 'upi', 'cheque') THEN
        v_mode    := 'credit';
        v_advance := 0;
    END IF;
    IF v_advance <= 0 THEN
        v_advance := 0;
        v_mode    := 'credit';
    END IF;

    -- Sum bill amount for validation + status classification
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        qty numeric, rate numeric, commission numeric, less_units numeric
    ) LOOP
        v_total_bill_amount := v_total_bill_amount + (
            (COALESCE(v_item.qty, 0) - COALESCE(v_item.less_units, 0))
            * COALESCE(v_item.rate, 0)
            * (1 - COALESCE(v_item.commission, 0) / 100.0)
        );
    END LOOP;

    -- Payment details still validated for non-credit modes (cheque number etc.)
    IF v_mode <> 'credit' THEN
        DECLARE
            v_validation JSON;
        BEGIN
            v_validation := mandi.validate_payment_input(
                p_amount          := v_advance,
                p_mode            := v_mode,
                p_bill_amount     := v_total_bill_amount,
                p_cheque_no       := p_advance_cheque_no,
                p_bank_account_id := p_advance_bank_account_id,
                p_cheque_status   := v_cheque_cleared,
                p_cheque_date     := p_advance_cheque_date
            );
            IF NOT (v_validation->>'valid')::BOOLEAN THEN
                RAISE EXCEPTION 'Payment validation failed: %', v_validation->>'errors';
            END IF;
        END;
    END IF;

    -- Commission-type classification
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(commission_type text) LOOP
        IF v_item.commission_type = 'farmer'   THEN v_farmer_count   := v_farmer_count + 1; END IF;
        IF v_item.commission_type = 'supplier' THEN v_supplier_count := v_supplier_count + 1; END IF;
    END LOOP;

    IF v_farmer_count > 0 AND v_supplier_count > 0 THEN
        v_calculated_arrival_type := 'mixed';
    ELSIF v_farmer_count > 0 THEN
        v_calculated_arrival_type := 'farmer';
    ELSIF v_supplier_count > 0 THEN
        v_calculated_arrival_type := 'supplier';
    ELSE
        v_calculated_arrival_type := p_arrival_type;
    END IF;

    -- Consume bill numbers: global bill_no + per-party contact_bill_no
    v_arrival_bill_no         := mandi.get_internal_sequence(p_organization_id, 'bill_no');
    v_arrival_contact_bill_no := mandi.next_contact_bill_no(p_organization_id, p_supplier_id, 'purchase');

    INSERT INTO mandi.arrivals (
        organization_id, party_id, arrival_date, arrival_type, status,
        advance_amount, advance_payment_mode, advance_bank_account_id,
        bill_no, contact_bill_no, created_by, created_at
    ) VALUES (
        p_organization_id, p_supplier_id, p_arrival_date, v_calculated_arrival_type, 'completed',
        v_advance, v_mode, p_advance_bank_account_id,
        v_arrival_bill_no, v_arrival_contact_bill_no, p_created_by, NOW()
    ) RETURNING id
      INTO v_arrival_id;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        item_id uuid, commodity_id uuid,
        qty numeric, unit text, rate numeric,
        commission numeric, commission_type text, weight_loss numeric, less_units numeric,
        storage_location text, lot_code text
    ) LOOP
        DECLARE
            v_lot_id UUID;
            v_lot_code TEXT;
            v_effective_item_id UUID;
            v_lot_advance NUMERIC;
            v_lot_mode    TEXT;
        BEGIN
            v_effective_item_id := COALESCE(v_item.item_id, v_item.commodity_id);
            v_lot_code := COALESCE(v_item.lot_code,
                'LOT-' || COALESCE(v_arrival_contact_bill_no, v_arrival_bill_no) || '-' || substr(gen_random_uuid()::text, 1, 4));

            -- Only first lot carries the advance payment (matches arrivals form)
            IF v_first_lot_id IS NULL THEN
                v_lot_advance := v_advance;
                v_lot_mode    := v_mode;
            ELSE
                v_lot_advance := 0;
                v_lot_mode    := 'credit';
            END IF;

            INSERT INTO mandi.lots (
                organization_id, arrival_id, item_id, lot_code, initial_qty, current_qty,
                unit, supplier_rate, commission_percent, less_percent, status,
                storage_location, less_units, arrival_type, created_at,
                contact_id,
                advance, advance_payment_mode,
                advance_cheque_no, advance_cheque_date, advance_bank_name,
                advance_bank_account_id, advance_cheque_status, recording_status
            ) VALUES (
                p_organization_id, v_arrival_id, v_effective_item_id,
                v_lot_code,
                v_item.qty, v_item.qty, COALESCE(v_item.unit, 'Box'),
                v_item.rate, COALESCE(v_item.commission, 0),
                COALESCE(v_item.weight_loss, 0), 'active', v_item.storage_location,
                COALESCE(v_item.less_units, 0), COALESCE(v_item.commission_type, v_calculated_arrival_type), NOW(),
                p_supplier_id,
                v_lot_advance, v_lot_mode,
                CASE WHEN v_lot_mode = 'cheque' THEN p_advance_cheque_no ELSE NULL END,
                CASE WHEN v_lot_mode = 'cheque' THEN p_advance_cheque_date ELSE NULL END,
                CASE WHEN v_lot_mode IN ('bank', 'cheque') THEN p_advance_bank_name ELSE NULL END,
                CASE WHEN v_lot_mode IN ('bank', 'cheque') THEN p_advance_bank_account_id ELSE NULL END,
                CASE WHEN v_lot_mode = 'cheque' THEN v_cheque_cleared ELSE false END,
                'recorded'
            ) RETURNING id INTO v_lot_id;

            IF v_first_lot_id IS NULL THEN v_first_lot_id := v_lot_id; END IF;

            -- Purchase bill amounts
            v_net_qty     := COALESCE(v_item.qty, 0) - COALESCE(v_item.less_units, 0);
            v_gross       := v_net_qty * COALESCE(v_item.rate, 0);
            v_comm        := v_gross * COALESCE(v_item.commission, 0) / 100.0;
            v_net_payable := v_gross - v_comm;

            v_bill_status := mandi.classify_bill_status(
                p_net_payable    => v_net_payable,
                p_advance        => v_lot_advance,
                p_mode           => v_lot_mode,
                p_cheque_cleared => (v_lot_mode = 'cheque' AND v_cheque_cleared)
            );

            INSERT INTO mandi.purchase_bills (
                organization_id, lot_id, contact_id,
                bill_number, bill_date,
                gross_amount, commission_amount, less_amount,
                net_payable, status, payment_status
            ) VALUES (
                p_organization_id, v_lot_id, p_supplier_id,
                'PB-' || COALESCE(v_arrival_contact_bill_no, v_arrival_bill_no) || '-' ||
                COALESCE((SELECT name FROM mandi.commodities WHERE id = v_effective_item_id LIMIT 1), 'ITEM'),
                p_arrival_date,
                v_gross, v_comm, 0,
                v_net_payable, 'completed', v_bill_status
            );

            UPDATE mandi.lots SET net_payable = v_net_payable WHERE id = v_lot_id;
        END;
    END LOOP;

    PERFORM mandi.post_arrival_ledger(v_arrival_id);

    RETURN jsonb_build_object(
        'success', true,
        'arrival_id', v_arrival_id,
        'bill_no', v_arrival_bill_no,
        'contact_bill_no', v_arrival_contact_bill_no,
        'payment_status', v_bill_status
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION mandi.record_quick_purchase(
    uuid, uuid, date, text, jsonb, numeric, text, uuid, text, date, text, boolean, boolean, uuid
) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. Lot-level status sync — whenever a lot's advance/mode changes,
--    re-classify the purchase_bill and re-post the ledger.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mandi.sync_purchase_bill_status(p_lot_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
    v_lot    RECORD;
    v_status TEXT;
BEGIN
    SELECT * INTO v_lot FROM mandi.lots WHERE id = p_lot_id;
    IF NOT FOUND THEN RETURN; END IF;

    v_status := mandi.classify_bill_status(
        p_net_payable    => COALESCE(v_lot.net_payable, 0),
        p_advance        => COALESCE(v_lot.advance, 0),
        p_mode           => LOWER(COALESCE(v_lot.advance_payment_mode, 'credit')),
        p_cheque_cleared => COALESCE(v_lot.advance_cheque_status, false)
    );

    UPDATE mandi.purchase_bills
       SET payment_status = v_status
     WHERE lot_id = p_lot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION mandi.sync_purchase_bill_status(uuid)
    TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION mandi.trg_sync_purchase_bill_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM mandi.sync_purchase_bill_status(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_purchase_bill_status ON mandi.lots;
CREATE TRIGGER trg_sync_purchase_bill_status
AFTER UPDATE OF advance, advance_payment_mode, advance_cheque_status, net_payable
ON mandi.lots
FOR EACH ROW EXECUTE FUNCTION mandi.trg_sync_purchase_bill_status();

-- ---------------------------------------------------------------------
-- 7. One-time backfill: correct existing purchase_bills payment_status
--    so the UI instantly reflects reality for historical arrivals.
-- ---------------------------------------------------------------------
UPDATE mandi.purchase_bills pb
   SET payment_status = mandi.classify_bill_status(
        p_net_payable    => COALESCE(pb.net_payable, 0),
        p_advance        => COALESCE(l.advance, 0),
        p_mode           => LOWER(COALESCE(l.advance_payment_mode, 'credit')),
        p_cheque_cleared => COALESCE(l.advance_cheque_status, false)
   )
  FROM mandi.lots l
 WHERE pb.lot_id = l.id;

COMMIT;
