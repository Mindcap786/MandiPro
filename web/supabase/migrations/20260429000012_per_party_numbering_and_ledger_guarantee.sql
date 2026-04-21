-- Migration: 20260429000012_per_party_numbering_and_ledger_guarantee.sql
-- Goals:
--   1) Arrivals bill number peeks/consumes PER-PARTY (not global) using contact_bill_no.
--      Manual overrides accepted; same number for same party is rejected with a clear error.
--   2) post_arrival_ledger never silently skips — either posts a Daybook voucher or raises.
--      AFTER-trigger guarantees posting can't be forgotten; UPDATE auto-repost handles edits.
--   3) One-time backfill posts ledger for every arrival currently missing one (heals Umar
--      and any similar cases) without touching sales.
-- Non-goals: sales flow, confirm_sale_transaction, post_sale_ledger are intentionally untouched.

BEGIN;

-- ==============================================================
-- PART 1 — Per-party bill numbering (contact_bill_no-driven)
-- ==============================================================

-- 1.1 Gap-aware CONSUME: always catches up to MAX(contact_bill_no) actually used
CREATE OR REPLACE FUNCTION mandi.next_contact_bill_no(
    p_organization_id uuid,
    p_contact_id uuid,
    p_sequence_type text
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
    v_max_used bigint := 0;
    v_next bigint;
BEGIN
    IF p_sequence_type = 'purchase' THEN
        SELECT COALESCE(MAX(contact_bill_no), 0) INTO v_max_used
        FROM mandi.arrivals
        WHERE organization_id = p_organization_id AND party_id = p_contact_id;
    ELSIF p_sequence_type = 'sale' THEN
        SELECT COALESCE(MAX(contact_bill_no), 0) INTO v_max_used
        FROM mandi.sales
        WHERE organization_id = p_organization_id AND buyer_id = p_contact_id;
    END IF;

    INSERT INTO mandi.contact_bill_sequences (organization_id, contact_id, sequence_type, last_bill_no, updated_at)
    VALUES (p_organization_id, p_contact_id, p_sequence_type, v_max_used + 1, now())
    ON CONFLICT (organization_id, contact_id, sequence_type)
    DO UPDATE
    SET last_bill_no = GREATEST(mandi.contact_bill_sequences.last_bill_no + 1, v_max_used + 1),
        updated_at = now()
    RETURNING last_bill_no INTO v_next;

    RETURN v_next;
END;
$$;

-- 1.2 Read-only PEEK for UI (safe to call repeatedly while form is open)
CREATE OR REPLACE FUNCTION mandi.peek_contact_bill_no(
    p_organization_id uuid,
    p_contact_id uuid,
    p_sequence_type text
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_max_used bigint := 0;
    v_stored bigint := 0;
BEGIN
    IF p_contact_id IS NULL THEN
        RETURN 1;
    END IF;

    IF p_sequence_type = 'purchase' THEN
        SELECT COALESCE(MAX(contact_bill_no), 0) INTO v_max_used
        FROM mandi.arrivals
        WHERE organization_id = p_organization_id AND party_id = p_contact_id;
    ELSIF p_sequence_type = 'sale' THEN
        SELECT COALESCE(MAX(contact_bill_no), 0) INTO v_max_used
        FROM mandi.sales
        WHERE organization_id = p_organization_id AND buyer_id = p_contact_id;
    END IF;

    SELECT COALESCE(last_bill_no, 0) INTO v_stored
    FROM mandi.contact_bill_sequences
    WHERE organization_id = p_organization_id
      AND contact_id = p_contact_id
      AND sequence_type = p_sequence_type;

    RETURN GREATEST(v_max_used, v_stored) + 1;
END;
$$;

-- 1.3 Arrivals form calls get_next_contact_bill_no — redirect it to per-party peek
DROP FUNCTION IF EXISTS mandi.get_next_contact_bill_no(uuid, uuid, text) CASCADE;
CREATE OR REPLACE FUNCTION mandi.get_next_contact_bill_no(
    p_organization_id uuid,
    p_contact_id uuid,
    p_type text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_contact_id IS NULL THEN
        RETURN 1;
    END IF;

    IF p_type IN ('sale', 'sales') THEN
        RETURN mandi.peek_contact_bill_no(p_organization_id, p_contact_id, 'sale');
    ELSE
        -- 'arrival', 'purchase', anything else → purchase sequence
        RETURN mandi.peek_contact_bill_no(p_organization_id, p_contact_id, 'purchase');
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION mandi.get_next_contact_bill_no(uuid, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION mandi.peek_contact_bill_no(uuid, uuid, text) TO anon, authenticated, service_role;

-- 1.4 Duplicate guard: same (org, party, contact_bill_no) cannot repeat
CREATE OR REPLACE FUNCTION mandi.check_arrival_contact_bill_unique()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.contact_bill_no IS NOT NULL AND NEW.party_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM mandi.arrivals
            WHERE organization_id = NEW.organization_id
              AND party_id = NEW.party_id
              AND contact_bill_no = NEW.contact_bill_no
              AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        ) THEN
            RAISE EXCEPTION USING
                ERRCODE = 'unique_violation',
                MESSAGE = format('Bill #%s already exists for this supplier — pick a different number.', NEW.contact_bill_no);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_arrival_contact_bill_unique ON mandi.arrivals;
CREATE TRIGGER trg_check_arrival_contact_bill_unique
BEFORE INSERT OR UPDATE OF contact_bill_no, party_id ON mandi.arrivals
FOR EACH ROW EXECUTE FUNCTION mandi.check_arrival_contact_bill_unique();

-- 1.5 Let create_mixed_arrival accept a client-supplied contact_bill_no
CREATE OR REPLACE FUNCTION mandi.create_mixed_arrival(p_arrival jsonb, p_created_by uuid DEFAULT NULL::uuid)
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
    v_advance_amount  := COALESCE((p_arrival->>'advance')::NUMERIC, 0);
    v_advance_mode    := COALESCE(p_arrival->>'advance_payment_mode', 'cash');
    v_arrival_type    := COALESCE(p_arrival->>'arrival_type', 'commission');
    v_header_location := p_arrival->>'storage_location';

    IF v_organization_id IS NULL THEN RAISE EXCEPTION 'organization_id is required'; END IF;
    IF v_party_id IS NULL THEN RAISE EXCEPTION 'Supplier/Party is required.'; END IF;

    BEGIN v_idempotency_key := (p_arrival->>'idempotency_key')::UUID; EXCEPTION WHEN OTHERS THEN v_idempotency_key := NULL; END;
    IF v_idempotency_key IS NOT NULL THEN
        SELECT id, COALESCE(metadata, '{}'::jsonb) INTO v_arrival_id, v_metadata
        FROM mandi.arrivals
        WHERE idempotency_key = v_idempotency_key AND organization_id = v_organization_id;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'arrival_id', v_arrival_id, 'idempotent', true, 'metadata', v_metadata);
        END IF;
    END IF;

    -- Global bill_no (internal audit counter, still auto-consumed)
    v_bill_no := NULLIF(p_arrival->>'bill_no', '')::BIGINT;
    IF v_bill_no IS NULL OR v_bill_no <= 0 THEN
        v_bill_no := mandi.get_internal_sequence(v_organization_id, 'bill_no');
    ELSE
        UPDATE mandi.id_sequences
        SET last_number = GREATEST(last_number, v_bill_no), updated_at = NOW()
        WHERE organization_id = v_organization_id AND entity_type = 'bill_no';
    END IF;

    -- Per-party user-visible bill number. If client provided, use it; else BEFORE-trigger fills it.
    v_contact_bill_no := NULLIF(p_arrival->>'contact_bill_no', '')::BIGINT;

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
        v_item_location := COALESCE(v_lot.value->>'storage_location', v_header_location);
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
            CASE WHEN jsonb_array_length(p_arrival->'items') = 1 THEN v_advance_mode ELSE 'cash' END,
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

-- ==============================================================
-- PART 2 — Ledger posting: never silently skip
-- ==============================================================

CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_arrival             RECORD;
    v_temp_lot            RECORD;
    v_item_names          text;
    v_narration           text;
    v_bill_label          text;
    v_org_id              uuid;
    v_party_id            uuid;
    v_total_payable       numeric := 0;
    v_inventory_acc_id    uuid;
    v_ap_acc_id           uuid;
    v_cash_acc_id         uuid;
    v_bank_acc_id         uuid;
    v_payment_acc_id      uuid;
    v_purchase_voucher_id uuid;
    v_payment_voucher_id  uuid;
    v_next_v_no           bigint;
    v_has_lots            boolean;
BEGIN
    SELECT * INTO v_arrival FROM mandi.arrivals WHERE id = p_arrival_id;
    IF NOT FOUND THEN RETURN; END IF;

    v_org_id := v_arrival.organization_id;
    v_party_id := v_arrival.party_id;

    -- Short-circuit if there are no lots yet (safety-net trigger fires before create_mixed_arrival's lot inserts)
    SELECT EXISTS (SELECT 1 FROM mandi.lots WHERE arrival_id = p_arrival_id) INTO v_has_lots;
    IF NOT v_has_lots AND COALESCE(v_arrival.advance_amount, 0) <= 0 THEN
        RETURN;
    END IF;

    -- Refresh lot-level math so totals reflect latest rates/expenses
    FOR v_temp_lot IN SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id LOOP
        PERFORM mandi.refresh_lot_payment_status(v_temp_lot.id);
    END LOOP;

    -- Account lookups (LOUDLY fail if chart-of-accounts incomplete)
    SELECT id INTO v_inventory_acc_id FROM mandi.accounts
    WHERE organization_id = v_org_id
      AND (account_sub_type = 'inventory' OR name ILIKE '%Stock%' OR code = '1200')
    ORDER BY (account_sub_type = 'inventory') DESC LIMIT 1;

    SELECT id INTO v_ap_acc_id FROM mandi.accounts
    WHERE organization_id = v_org_id
      AND (account_sub_type = 'accounts_payable' OR name ILIKE '%Payable%' OR name ILIKE '%Farmer%' OR code = '2100')
    ORDER BY (account_sub_type = 'accounts_payable') DESC LIMIT 1;

    SELECT id INTO v_cash_acc_id FROM mandi.accounts
    WHERE organization_id = v_org_id
      AND (account_sub_type = 'cash' OR name ILIKE 'Cash%' OR code = '1001')
    ORDER BY (code = '1001') DESC LIMIT 1;

    SELECT id INTO v_bank_acc_id FROM mandi.accounts
    WHERE organization_id = v_org_id
      AND (account_sub_type = 'bank' OR name ILIKE 'Bank%' OR code = '1002')
    ORDER BY (code = '1002') DESC LIMIT 1;

    IF v_arrival.advance_bank_account_id IS NOT NULL THEN v_bank_acc_id := v_arrival.advance_bank_account_id; END IF;

    IF v_inventory_acc_id IS NULL OR v_ap_acc_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'foreign_key_violation',
            MESSAGE = 'Chart of Accounts incomplete for this organization (Inventory and/or Accounts Payable missing). Cannot post arrival ledger.';
    END IF;

    -- Totals — udhaar arrivals with rate must still post
    SELECT SUM(COALESCE(net_payable, 0)) INTO v_total_payable FROM mandi.lots WHERE arrival_id = p_arrival_id;
    IF COALESCE(v_total_payable, 0) <= 0 THEN
        SELECT SUM(COALESCE(v.net_payable, 0)) INTO v_total_payable
        FROM mandi.lots l, mandi.get_lot_bill_components(l.id) v
        WHERE l.arrival_id = p_arrival_id;
    END IF;
    v_total_payable := COALESCE(v_total_payable, 0);

    v_bill_label := COALESCE(v_arrival.contact_bill_no::text, v_arrival.reference_no, v_arrival.bill_no::text, 'NEW');
    SELECT string_agg(DISTINCT i.name, ', ') INTO v_item_names
    FROM mandi.lots l JOIN mandi.commodities i ON l.item_id = i.id
    WHERE l.arrival_id = p_arrival_id;
    v_narration := 'Purchase Bill #' || v_bill_label || ' | ' || COALESCE(v_item_names, 'Goods');

    -- Idempotent rewrite
    DELETE FROM mandi.ledger_entries WHERE arrival_id = p_arrival_id;
    DELETE FROM mandi.ledger_entries WHERE reference_id = p_arrival_id AND transaction_type IN ('purchase', 'payment');
    DELETE FROM mandi.vouchers      WHERE reference_id = p_arrival_id AND type IN ('purchase', 'payment');

    -- Purchase voucher (udhaar goes here — party gets credit)
    IF v_total_payable > 0 THEN
        SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_next_v_no
        FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';

        INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, party_id, arrival_id, reference_id, status)
        VALUES (v_org_id, v_arrival.arrival_date, 'purchase', v_next_v_no, v_total_payable, v_narration, v_party_id, p_arrival_id, p_arrival_id, 'active')
        RETURNING id INTO v_purchase_voucher_id;

        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, entry_date, credit, description, transaction_type, arrival_id, reference_id, status)
        VALUES (v_org_id, v_purchase_voucher_id, v_party_id, v_ap_acc_id, v_arrival.arrival_date, v_total_payable, v_narration, 'purchase', p_arrival_id, p_arrival_id, 'active');

        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, entry_date, debit, description, transaction_type, arrival_id, reference_id, status)
        VALUES (v_org_id, v_purchase_voucher_id, v_inventory_acc_id, v_arrival.arrival_date, v_total_payable, v_narration, 'purchase', p_arrival_id, p_arrival_id, 'active');
    END IF;

    -- Advance (only when actually paid — cheque waits for clearance)
    IF COALESCE(v_arrival.advance_amount, 0) > 0
       AND LOWER(COALESCE(v_arrival.advance_payment_mode, '')) IN ('cash', 'bank', 'upi') THEN
        v_payment_acc_id := CASE
            WHEN LOWER(COALESCE(v_arrival.advance_payment_mode, 'cash')) IN ('bank', 'upi') THEN COALESCE(v_bank_acc_id, v_cash_acc_id)
            ELSE v_cash_acc_id
        END;
        IF v_payment_acc_id IS NOT NULL THEN
            SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_next_v_no
            FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'payment';

            INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, party_id, arrival_id, reference_id, payment_mode, status)
            VALUES (v_org_id, v_arrival.arrival_date, 'payment', v_next_v_no, v_arrival.advance_amount,
                    'Advance on Bill #' || v_bill_label, v_party_id, p_arrival_id, p_arrival_id, v_arrival.advance_payment_mode, 'active')
            RETURNING id INTO v_payment_voucher_id;

            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, entry_date, debit, description, transaction_type, arrival_id, reference_id, status)
            VALUES (v_org_id, v_payment_voucher_id, v_party_id, v_ap_acc_id, v_arrival.arrival_date, v_arrival.advance_amount,
                    'Advance Paid (' || v_arrival.advance_payment_mode || ')', 'payment', p_arrival_id, p_arrival_id, 'active');

            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, entry_date, credit, description, transaction_type, arrival_id, reference_id, status)
            VALUES (v_org_id, v_payment_voucher_id, v_payment_acc_id, v_arrival.arrival_date, v_arrival.advance_amount,
                    'Advance Paid (' || v_arrival.advance_payment_mode || ')', 'payment', p_arrival_id, p_arrival_id, 'active');
        END IF;
    END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION mandi.post_arrival_ledger(uuid) TO anon, authenticated, service_role;

-- 2.2 Safety net: INSERT or key-field UPDATE on arrivals always re-posts ledger
CREATE OR REPLACE FUNCTION mandi.auto_post_arrival_ledger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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

-- ==============================================================
-- PART 3 — Backfill arrivals missing ledger entries (heals Umar)
-- ==============================================================

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT a.id
        FROM mandi.arrivals a
        WHERE a.party_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM mandi.ledger_entries le
              WHERE le.reference_id = a.id AND le.transaction_type = 'purchase'
          )
    LOOP
        BEGIN
            PERFORM mandi.post_arrival_ledger(r.id);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Backfill skipped for arrival %: %', r.id, SQLERRM;
        END;
    END LOOP;
END $$;

-- ==============================================================
-- PART 4 — Reset per-party sequence table from actual data
-- ==============================================================

INSERT INTO mandi.contact_bill_sequences (organization_id, contact_id, sequence_type, last_bill_no, updated_at)
SELECT organization_id, party_id, 'purchase', MAX(COALESCE(contact_bill_no, 0)), now()
FROM mandi.arrivals
WHERE party_id IS NOT NULL
GROUP BY organization_id, party_id
ON CONFLICT (organization_id, contact_id, sequence_type)
DO UPDATE
SET last_bill_no = GREATEST(mandi.contact_bill_sequences.last_bill_no, EXCLUDED.last_bill_no),
    updated_at = now();

COMMIT;
