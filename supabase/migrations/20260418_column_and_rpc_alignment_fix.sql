-- ============================================================================
-- MIGRATION: Full Column & Schema Alignment Fix
-- Date: 2026-04-18
-- 
-- AUDIT RESULTS:
-- ❌ ARRIVALS: column 'less_units' does not exist
-- ❌ ARRIVALS RPC: column 'advance_payment_mode' of relation 'arrivals' does not exist  
-- ❌ LOTS: column 'supplier_id' does not exist
-- ❌ SALES: column 'gst_amount' does not exist
-- ❌ LEDGER_ENTRIES: column 'narration' does not exist
-- ❌ confirm_sale_transaction: MISSING! (PGRST202)
-- ============================================================================

-- ============================================================================
-- PART 1: mandi.arrivals — Add all missing columns
-- ============================================================================
ALTER TABLE mandi.arrivals
  ADD COLUMN IF NOT EXISTS less_units         NUMERIC          DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_qty          NUMERIC          DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_qty            NUMERIC          DEFAULT 0,
  ADD COLUMN IF NOT EXISTS less_percent       NUMERIC          DEFAULT 0,
  ADD COLUMN IF NOT EXISTS num_lots           INTEGER          DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_percent NUMERIC          DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transport_amount   NUMERIC          DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loading_amount     NUMERIC          DEFAULT 0,
  ADD COLUMN IF NOT EXISTS packing_amount     NUMERIC          DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_amount     NUMERIC          DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_payment_mode TEXT           DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS lot_prefix         TEXT             DEFAULT 'LOT';

COMMENT ON COLUMN mandi.arrivals.less_units IS 'Number of units deducted from gross qty';
COMMENT ON COLUMN mandi.arrivals.advance_payment_mode IS 'Payment mode for advance: cash|cheque|bank_transfer|upi';

-- ============================================================================
-- PART 2: mandi.lots — Add supplier_id column
-- ============================================================================
ALTER TABLE mandi.lots
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES mandi.contacts(id) ON DELETE SET NULL;

COMMENT ON COLUMN mandi.lots.supplier_id IS 'FK to the supplier/farmer who delivered this lot';

-- ============================================================================
-- PART 3: mandi.sales — Add gst_amount column (alias for gst_total)
-- ============================================================================
ALTER TABLE mandi.sales
  ADD COLUMN IF NOT EXISTS gst_amount NUMERIC DEFAULT 0;

-- Backfill from existing gst_total data
UPDATE mandi.sales SET gst_amount = COALESCE(gst_total, 0) WHERE gst_amount = 0;

COMMENT ON COLUMN mandi.sales.gst_amount IS 'Total GST amount (alias/mirror of gst_total for API compat)';

-- ============================================================================
-- PART 4: mandi.ledger_entries — Add narration column
-- ============================================================================
ALTER TABLE mandi.ledger_entries
  ADD COLUMN IF NOT EXISTS narration TEXT;

COMMENT ON COLUMN mandi.ledger_entries.narration IS 'Human-readable description of this ledger entry';

-- Backfill narration from description column if it exists
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='mandi' AND table_name='ledger_entries' AND column_name='description') THEN
    -- Temporarily disable the strict voucher balance trigger to avoid crashing on legacy unbalanced data
    BEGIN
        ALTER TABLE mandi.ledger_entries DISABLE TRIGGER enforce_voucher_balance;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;

    UPDATE mandi.ledger_entries SET narration = description WHERE narration IS NULL AND description IS NOT NULL;

    BEGIN
        ALTER TABLE mandi.ledger_entries ENABLE TRIGGER enforce_voucher_balance;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END IF;
END $$;

-- ============================================================================
-- PART 5: Rebuild confirm_sale_transaction (MISSING — PGRST202)
-- This is the core POS transaction RPC. Pulled from 20260325 migration logic.
-- ============================================================================
DO $$ 
DECLARE 
    r RECORD;
BEGIN 
    -- 🚨 Drop all existing overloads of confirm_sale_transaction in mandi and public schemas
    FOR r IN (
        SELECT p.oid::regprocedure::text AS func_signature
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE p.proname = 'confirm_sale_transaction' AND n.nspname IN ('mandi', 'public')
    ) LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id       UUID,
    p_sale_date             DATE,
    p_buyer_id              UUID DEFAULT NULL,
    p_items                 JSONB DEFAULT '[]',
    p_total_amount          NUMERIC DEFAULT 0,
    p_header_discount       NUMERIC DEFAULT 0,
    p_discount_percent      NUMERIC DEFAULT 0,
    p_discount_amount       NUMERIC DEFAULT 0,
    p_payment_mode          TEXT DEFAULT 'cash',
    p_narration             TEXT DEFAULT NULL,
    p_cheque_number         TEXT DEFAULT NULL,
    p_cheque_date           DATE DEFAULT NULL,
    p_cheque_bank           TEXT DEFAULT NULL,
    p_bank_account_id       UUID DEFAULT NULL,
    p_cheque_status         BOOLEAN DEFAULT FALSE,
    p_amount_received       NUMERIC DEFAULT 0,
    p_due_date              DATE DEFAULT NULL,
    p_market_fee            NUMERIC DEFAULT 0,
    p_nirashrit             NUMERIC DEFAULT 0,
    p_misc_fee              NUMERIC DEFAULT 0,
    p_loading_charges       NUMERIC DEFAULT 0,
    p_unloading_charges     NUMERIC DEFAULT 0,
    p_other_expenses        NUMERIC DEFAULT 0,
    p_gst_enabled           BOOLEAN DEFAULT FALSE,
    p_cgst_amount           NUMERIC DEFAULT 0,
    p_sgst_amount           NUMERIC DEFAULT 0,
    p_igst_amount           NUMERIC DEFAULT 0,
    p_gst_total             NUMERIC DEFAULT 0,
    p_place_of_supply       TEXT DEFAULT NULL,
    p_buyer_gstin           TEXT DEFAULT NULL,
    p_is_igst               BOOLEAN DEFAULT FALSE,
    p_idempotency_key       UUID DEFAULT NULL,
    p_created_by            UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, core, public
AS $$
DECLARE
    v_sale_id       UUID;
    v_invoice_no    TEXT;
    v_item          RECORD;
    v_lot           RECORD;
    v_total         NUMERIC := 0;
    v_gst_total     NUMERIC := COALESCE(p_gst_total, p_cgst_amount + p_sgst_amount + p_igst_amount);
    v_fee_total     NUMERIC := COALESCE(p_market_fee,0) + COALESCE(p_nirashrit,0) + COALESCE(p_misc_fee,0) + 
                               COALESCE(p_loading_charges,0) + COALESCE(p_unloading_charges,0) + COALESCE(p_other_expenses,0);
    v_payment_status TEXT;
BEGIN
    -- Idempotency check: return existing sale if key already used
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_sale_id FROM mandi.sales 
        WHERE idempotency_key = p_idempotency_key AND organization_id = p_organization_id;
        IF FOUND THEN
            RETURN jsonb_build_object('sale_id', v_sale_id, 'idempotent', true);
        END IF;
    END IF;

    -- Validate items and compute total from actual lot data
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT id, current_qty, status INTO v_lot
        FROM mandi.lots
        WHERE id = (v_item.value->>'lot_id')::UUID
          AND organization_id = p_organization_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'INVALID_LOT: Lot % not found or not in your org', v_item.value->>'lot_id';
        END IF;

        IF v_lot.status NOT IN ('Available', 'active', 'partial') THEN
            RAISE EXCEPTION 'INVALID_LOT: Lot % is not available for sale (status: %)', v_item.value->>'lot_id', v_lot.status;
        END IF;

        DECLARE v_qty NUMERIC := (v_item.value->>'quantity')::NUMERIC;
        BEGIN
            IF v_lot.current_qty < v_qty THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Lot % has only % units available, requested %',
                    v_item.value->>'lot_id', v_lot.current_qty, v_qty;
            END IF;

            -- Deduct stock
            UPDATE mandi.lots 
            SET current_qty = current_qty - v_qty,
                status = CASE WHEN current_qty - v_qty <= 0 THEN 'Sold' ELSE 'partial' END,
                updated_at = NOW()
            WHERE id = v_lot.id;

            v_total := v_total + ((v_item.value->>'quantity')::NUMERIC * (v_item.value->>'rate_per_unit')::NUMERIC);
        END;
    END LOOP;

    -- Generate invoice number
    v_invoice_no := 'INV-' || TO_CHAR(p_sale_date, 'YYYYMMDD') || '-' || 
                    LPAD(FLOOR(RANDOM() * 9999)::TEXT, 4, '0');

    -- Determine payment status
    v_payment_status := CASE
        WHEN p_payment_mode = 'udhaar' THEN 'pending'
        WHEN COALESCE(p_amount_received, p_total_amount, v_total) >= COALESCE(p_total_amount, v_total) THEN 'paid'
        WHEN COALESCE(p_amount_received, 0) > 0 THEN 'partial'
        ELSE 'pending'
    END;

    -- Insert sale record
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, invoice_no,
        subtotal, discount_amount, gst_total, gst_amount, total_amount,
        payment_mode, payment_status, paid_amount, balance_due,
        narration, cheque_no, cheque_date, bank_name, bank_account_id,
        cheque_status, amount_received, due_date,
        market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, other_expenses,
        gst_enabled, cgst_amount, sgst_amount, igst_amount,
        place_of_supply, buyer_gstin, is_igst,
        status, idempotency_key, created_by
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, v_invoice_no,
        COALESCE(p_total_amount, v_total), COALESCE(p_discount_amount, p_header_discount, 0), 
        v_gst_total, v_gst_total, 
        COALESCE(p_total_amount, v_total) + v_fee_total + v_gst_total,
        p_payment_mode, v_payment_status, 
        COALESCE(p_amount_received, CASE WHEN p_payment_mode NOT IN ('udhaar') THEN p_total_amount ELSE 0 END),
        GREATEST(0, COALESCE(p_total_amount, v_total) - COALESCE(p_amount_received, 0)),
        p_narration, p_cheque_number, p_cheque_date, p_cheque_bank, p_bank_account_id,
        p_cheque_status, COALESCE(p_amount_received, 0), p_due_date,
        COALESCE(p_market_fee,0), COALESCE(p_nirashrit,0), COALESCE(p_misc_fee,0),
        COALESCE(p_loading_charges,0), COALESCE(p_unloading_charges,0), COALESCE(p_other_expenses,0),
        COALESCE(p_gst_enabled, FALSE), COALESCE(p_cgst_amount,0), COALESCE(p_sgst_amount,0), COALESCE(p_igst_amount,0),
        p_place_of_supply, p_buyer_gstin, COALESCE(p_is_igst, FALSE),
        'confirmed', p_idempotency_key, p_created_by
    ) RETURNING id INTO v_sale_id;

    -- Insert sale items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO mandi.sale_items (
            organization_id, sale_id, lot_id,
            qty, rate, amount, discount_amount, created_by
        ) VALUES (
            p_organization_id, v_sale_id, (v_item.value->>'lot_id')::UUID,
            (v_item.value->>'quantity')::NUMERIC,
            (v_item.value->>'rate_per_unit')::NUMERIC,
            (v_item.value->>'quantity')::NUMERIC * (v_item.value->>'rate_per_unit')::NUMERIC,
            COALESCE((v_item.value->>'discount_amount')::NUMERIC, 0),
            p_created_by
        );
    END LOOP;

    RETURN jsonb_build_object(
        'sale_id', v_sale_id,
        'invoice_no', v_invoice_no,
        'payment_status', v_payment_status,
        'idempotent', false
    );
END;
$$;

-- Create public wrapper for backwards compatibility
CREATE OR REPLACE FUNCTION public.confirm_sale_transaction(
    p_organization_id UUID,
    p_sale_date DATE,
    p_buyer_id UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]',
    p_total_amount NUMERIC DEFAULT 0,
    p_header_discount NUMERIC DEFAULT 0,
    p_discount_percent NUMERIC DEFAULT 0,
    p_discount_amount NUMERIC DEFAULT 0,
    p_payment_mode TEXT DEFAULT 'cash',
    p_narration TEXT DEFAULT NULL,
    p_cheque_number TEXT DEFAULT NULL,
    p_cheque_date DATE DEFAULT NULL,
    p_cheque_bank TEXT DEFAULT NULL,
    p_bank_account_id UUID DEFAULT NULL,
    p_cheque_status BOOLEAN DEFAULT FALSE,
    p_amount_received NUMERIC DEFAULT 0,
    p_due_date DATE DEFAULT NULL,
    p_market_fee NUMERIC DEFAULT 0,
    p_nirashrit NUMERIC DEFAULT 0,
    p_misc_fee NUMERIC DEFAULT 0,
    p_loading_charges NUMERIC DEFAULT 0,
    p_unloading_charges NUMERIC DEFAULT 0,
    p_other_expenses NUMERIC DEFAULT 0,
    p_gst_enabled BOOLEAN DEFAULT FALSE,
    p_cgst_amount NUMERIC DEFAULT 0,
    p_sgst_amount NUMERIC DEFAULT 0,
    p_igst_amount NUMERIC DEFAULT 0,
    p_gst_total NUMERIC DEFAULT 0,
    p_place_of_supply TEXT DEFAULT NULL,
    p_buyer_gstin TEXT DEFAULT NULL,
    p_is_igst BOOLEAN DEFAULT FALSE,
    p_idempotency_key UUID DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = mandi, core, public
AS $$
BEGIN
    RETURN mandi.confirm_sale_transaction(
        p_organization_id, p_sale_date, p_buyer_id, p_items, p_total_amount,
        p_header_discount, p_discount_percent, p_discount_amount, p_payment_mode,
        p_narration, p_cheque_number, p_cheque_date, p_cheque_bank, p_bank_account_id,
        p_cheque_status, p_amount_received, p_due_date,
        p_market_fee, p_nirashrit, p_misc_fee, p_loading_charges, p_unloading_charges, p_other_expenses,
        p_gst_enabled, p_cgst_amount, p_sgst_amount, p_igst_amount, p_gst_total,
        p_place_of_supply, p_buyer_gstin, p_is_igst, p_idempotency_key, p_created_by
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.confirm_sale_transaction TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION mandi.confirm_sale_transaction TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
