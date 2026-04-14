-- ==========================================================
-- ADVANCE PAYMENT - COMPLETE FIX (Run ALL at once)
-- Supabase SQL Editor → Paste → Run
-- ==========================================================

-- 1. Add missing columns to advance_payments table
ALTER TABLE mandi.advance_payments ADD COLUMN IF NOT EXISTS cheque_no TEXT;
ALTER TABLE mandi.advance_payments ADD COLUMN IF NOT EXISTS cheque_date DATE;
ALTER TABLE mandi.advance_payments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Completed';

-- 2. Ensure voucher_sequences table has correct structure
CREATE TABLE IF NOT EXISTS public.voucher_sequences (
    organization_id UUID PRIMARY KEY,
    last_no BIGINT DEFAULT 0
);

-- Add last_no column if it was created with a different name
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'voucher_sequences'
        AND column_name = 'last_no'
    ) THEN
        ALTER TABLE public.voucher_sequences ADD COLUMN last_no BIGINT DEFAULT 0;
    END IF;
END;
$$;

-- 3. Fix get_next_voucher_no to use last_no column
DROP FUNCTION IF EXISTS public.get_next_voucher_no(uuid);
CREATE OR REPLACE FUNCTION public.get_next_voucher_no(p_org_id uuid)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_next BIGINT;
BEGIN
    INSERT INTO public.voucher_sequences (organization_id, last_no)
    VALUES (p_org_id, 1)
    ON CONFLICT (organization_id)
    DO UPDATE SET last_no = voucher_sequences.last_no + 1
    RETURNING last_no INTO v_next;
    RETURN v_next;
END;
$$;

-- 4. Create helper to fetch mandi accounts from frontend
CREATE OR REPLACE FUNCTION public.get_organization_accounts(p_organization_id uuid)
RETURNS TABLE(id uuid, name text, code text, type text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT a.id, a.name, a.code, a.type
    FROM mandi.accounts a
    WHERE a.organization_id = p_organization_id
      AND a.is_active = true
    ORDER BY a.code ASC;
END;
$$;

-- 5. Drop all old versions of record_advance_payment
DROP FUNCTION IF EXISTS public.record_advance_payment(uuid,uuid,uuid,numeric,text,text,text,uuid,text,text,text);
DROP FUNCTION IF EXISTS public.record_advance_payment(uuid,uuid,uuid,numeric,text,date,text);
DROP FUNCTION IF EXISTS mandi.record_advance_payment(uuid,uuid,uuid,numeric,text,date,text);
DROP FUNCTION IF EXISTS public.record_advance_payment(uuid,uuid,uuid,numeric,text,date,text,uuid,text,date,text);
DROP FUNCTION IF EXISTS mandi.record_advance_payment(uuid,uuid,uuid,numeric,text,date,text,uuid,text,date,text);

-- 6. Create the final, correct function
CREATE OR REPLACE FUNCTION public.record_advance_payment(
    p_organization_id uuid,
    p_contact_id uuid,
    p_account_id uuid,
    p_amount numeric,
    p_date text,
    p_payment_mode text,
    p_narration text,
    p_lot_id uuid DEFAULT NULL,
    p_cheque_no text DEFAULT NULL,
    p_cheque_date text DEFAULT NULL,
    p_cheque_status text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_advance_id UUID;
    v_voucher_id UUID;
    v_voucher_no BIGINT;
    v_date DATE;
    v_account_id UUID;
BEGIN
    v_date := p_date::DATE;
    v_account_id := p_account_id;

    IF p_amount <= 0 THEN RAISE EXCEPTION 'Advance amount must be positive.'; END IF;

    -- Auto-select account if not provided
    IF v_account_id IS NULL THEN
        IF p_payment_mode = 'cash' THEN
            SELECT a.id INTO v_account_id FROM mandi.accounts a
            WHERE a.organization_id = p_organization_id
              AND (a.code = '1001' OR a.name ILIKE '%Cash%')
            ORDER BY a.code LIMIT 1;
        ELSE
            SELECT a.id INTO v_account_id FROM mandi.accounts a
            WHERE a.organization_id = p_organization_id
              AND (a.code = '1002' OR a.name ILIKE '%Bank%')
            ORDER BY a.code LIMIT 1;
        END IF;
    END IF;

    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'No Cash/Bank account found. Please create one in Chart of Accounts.';
    END IF;

    INSERT INTO mandi.advance_payments (
        organization_id, contact_id, lot_id, amount, payment_mode,
        date, narration, created_by, cheque_no, cheque_date, status
    ) VALUES (
        p_organization_id, p_contact_id, p_lot_id, p_amount, p_payment_mode, v_date,
        COALESCE(p_narration, 'Farmer Advance / Dadani'), auth.uid(),
        p_cheque_no,
        CASE WHEN p_cheque_date IS NOT NULL THEN p_cheque_date::DATE ELSE NULL END,
        COALESCE(p_cheque_status, 'Completed')
    ) RETURNING id INTO v_advance_id;

    v_voucher_no := public.get_next_voucher_no(p_organization_id);

    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount)
    VALUES (p_organization_id, v_date, 'payment', v_voucher_no,
            COALESCE(p_narration, 'Farmer Advance / Dadani'), p_amount)
    RETURNING id INTO v_voucher_id;

    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, contact_id, debit, credit,
        entry_date, transaction_type, reference_id, description, domain
    ) VALUES (
        p_organization_id, v_voucher_id, p_contact_id, p_amount, 0, v_date,
        'advance', v_advance_id, COALESCE(p_narration, 'Advance Payment'), 'mandi'
    );

    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, account_id, debit, credit,
        entry_date, transaction_type, reference_id, description, domain
    ) VALUES (
        p_organization_id, v_voucher_id, v_account_id, 0, p_amount, v_date,
        'advance', v_advance_id, 'Advance via ' || INITCAP(p_payment_mode), 'mandi'
    );

    RETURN jsonb_build_object(
        'success', true,
        'advance_id', v_advance_id,
        'voucher_no', v_voucher_no
    );
END;
$$;
