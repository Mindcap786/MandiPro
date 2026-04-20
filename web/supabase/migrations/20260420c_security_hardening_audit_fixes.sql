-- ============================================================
-- MANDIPRO SECURITY HARDENING — AUDIT REMEDIATION
-- Migration: 20260420c_security_hardening_audit_fixes.sql
-- Mode: Atomic (BEGIN/COMMIT) — all or nothing
-- Impact: Zero workflow changes. Additive policies + removal of
--         unused objects only.
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- FIX 1: Enable RLS on mandi.id_sequences
-- Table has organization_id. Only accessed by SECURITY DEFINER
-- function mandi.next_internal_id(). Zero frontend references.
-- ════════════════════════════════════════════════════════════
ALTER TABLE mandi.id_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "id_sequences_org_isolation" ON mandi.id_sequences
    FOR ALL USING (organization_id = (SELECT core.get_my_org_id()));

-- ════════════════════════════════════════════════════════════
-- FIX 2: Enable RLS on mandi.ledger_sync_errors
-- Table has NO organization_id. Only accessed by SECURITY DEFINER
-- functions (auto_repair, auto_heal, populate_ledger_bill_details).
-- Zero frontend references. Service-role only access.
-- ════════════════════════════════════════════════════════════
ALTER TABLE mandi.ledger_sync_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON mandi.ledger_sync_errors
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════
-- FIX 3: Enable RLS on mandi.ledger_repair_history
-- Table has NO organization_id. Same pattern as Fix 2.
-- Only 1 row. Zero frontend references.
-- ════════════════════════════════════════════════════════════
ALTER TABLE mandi.ledger_repair_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON mandi.ledger_repair_history
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════
-- FIX 4: Remove globally permissive commodity policies
-- The correct policy mandi_commodities_isolation already exists:
--   FOR ALL USING (organization_id = get_user_org_id())
-- These 4 policies use USING(true) which overrides org isolation
-- because PostgreSQL ORs PERMISSIVE policies together.
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "commodities_allow_all_select" ON mandi.commodities;
DROP POLICY IF EXISTS "commodities_allow_all_insert" ON mandi.commodities;
DROP POLICY IF EXISTS "commodities_allow_all_update" ON mandi.commodities;
DROP POLICY IF EXISTS "commodities_allow_all_delete" ON mandi.commodities;

-- ════════════════════════════════════════════════════════════
-- FIX 5: Convert 8 views from SECURITY DEFINER to SECURITY INVOKER
-- All underlying tables have correct org-isolation RLS.
-- Views currently bypass RLS because they run as the postgres
-- superuser owner. security_invoker=true makes them respect
-- the calling user's RLS (PG 15+ feature, we're on PG 17).
-- ════════════════════════════════════════════════════════════
ALTER VIEW mandi.view_mandi_session_summary SET (security_invoker = true);
ALTER VIEW mandi.view_location_stock SET (security_invoker = true);
ALTER VIEW mandi.view_party_balances SET (security_invoker = true);
ALTER VIEW mandi.v_purchase_bills_fast SET (security_invoker = true);
ALTER VIEW mandi.v_sales_fast SET (security_invoker = true);
ALTER VIEW mandi.v_ledger_balance_check SET (security_invoker = true);
ALTER VIEW mandi.v_recent_sync_errors SET (security_invoker = true);
ALTER VIEW mandi.v_unsynced_ledger_entries SET (security_invoker = true);

-- ════════════════════════════════════════════════════════════
-- FIX 6: Harden core.get_org_id_base search_path
-- Legacy function, SECURITY DEFINER but no fixed search_path.
-- Not used by any function, policy, or frontend code.
-- Adding SET search_path prevents schema injection.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION core.get_org_id_base(p_uid uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, public, pg_temp
AS $function$
BEGIN
    RETURN (SELECT organization_id FROM core.profiles WHERE id = p_uid LIMIT 1);
END;
$function$;

-- ════════════════════════════════════════════════════════════
-- FIX 7: Drop mandi.temp_test
-- Dead test function. Body: SELECT discount_amount FROM mandi.sales LIMIT 1
-- Zero references anywhere in the codebase.
-- ════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS mandi.temp_test();

-- ════════════════════════════════════════════════════════════
-- FIX 8: Drop mandi.profiles ghost table
-- 0 rows, 0 function refs, 0 view refs, 0 inbound FKs.
-- Complete orphan — a migration artifact from early development.
-- ════════════════════════════════════════════════════════════
DROP INDEX IF EXISTS mandi.idx_mandi_profiles_org_id;
DROP TABLE IF EXISTS mandi.profiles;

-- ════════════════════════════════════════════════════════════
-- FIX 9: Add idempotency protection to mandi.record_payment
-- Adds OPTIONAL p_idempotency_key TEXT DEFAULT NULL parameter.
-- Existing callers don't pass it → behavior unchanged.
-- When provided, checks for duplicate voucher before inserting.
-- Also adds idempotency_key column to mandi.vouchers (additive).
-- ════════════════════════════════════════════════════════════

-- 9a. Add idempotency_key column to vouchers (if not exists)
ALTER TABLE mandi.vouchers ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_vouchers_idempotency_key 
    ON mandi.vouchers (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 9b. Replace function with idempotency guard
CREATE OR REPLACE FUNCTION mandi.record_payment(
    p_organization_id uuid,
    p_party_id uuid,
    p_amount numeric,
    p_date date,
    p_mode text,
    p_invoice_id uuid DEFAULT NULL::uuid,
    p_remarks text DEFAULT NULL::text,
    p_cheque_no text DEFAULT NULL::text,
    p_cheque_date date DEFAULT NULL::date,
    p_bank_name text DEFAULT NULL::text,
    p_bank_account_id uuid DEFAULT NULL::uuid,
    p_idempotency_key text DEFAULT NULL::text   -- ← NEW (optional, backward-compatible)
)
RETURNS TABLE(voucher_id uuid, message text, linked_invoice_bill_no text)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_voucher_id UUID;
    v_narration TEXT;
    v_description TEXT;
    v_bill_no TEXT;
    v_bank_account_id UUID;
BEGIN
    -- ═══ NEW: Idempotency guard ═══
    -- If a key is provided, check for existing voucher with same key.
    -- Existing callers don't pass this param → this block is skipped.
    IF p_idempotency_key IS NOT NULL THEN
        SELECT v.id INTO v_voucher_id 
        FROM mandi.vouchers v
        WHERE v.idempotency_key = p_idempotency_key 
          AND v.organization_id = p_organization_id;
        IF FOUND THEN
            RETURN QUERY SELECT 
                v_voucher_id,
                'Payment already recorded (idempotent)'::TEXT,
                'Duplicate'::TEXT;
            RETURN;
        END IF;
    END IF;
    -- ═══ END NEW ═══

    -- Get bill number if invoice is linked
    IF p_invoice_id IS NOT NULL THEN
        SELECT bill_no INTO v_bill_no 
        FROM mandi.sales 
        WHERE id = p_invoice_id AND organization_id = p_organization_id;
    END IF;
    
    -- Build narration
    v_narration := 'Payment Received';
    v_description := 'Payment Received';
    
    IF v_bill_no IS NOT NULL THEN
        v_narration := 'Payment for Invoice #' || v_bill_no;
        v_description := 'Payment for Invoice #' || v_bill_no || ' - Rs ' || p_amount::TEXT;
    END IF;
    
    IF p_remarks IS NOT NULL AND p_remarks != '' THEN
        v_narration := v_narration || ' - ' || p_remarks;
    END IF;
    
    -- Get default bank account if not provided
    IF p_bank_account_id IS NULL AND p_mode IN ('bank', 'upi_bank') THEN
        SELECT id INTO v_bank_account_id
        FROM mandi.accounts
        WHERE organization_id = p_organization_id
              AND account_type IN ('bank', 'Cash')
        LIMIT 1;
    ELSE
        v_bank_account_id := p_bank_account_id;
    END IF;
    
    -- Create voucher with optional invoice linkage
    INSERT INTO mandi.vouchers (
        organization_id,
        type,
        date,
        amount,
        contact_id,
        invoice_id,
        payment_mode,
        narration,
        cheque_no,
        cheque_date,
        bank_name,
        bank_account_id,
        source,
        idempotency_key        -- ← NEW column populated
    ) VALUES (
        p_organization_id,
        'receipt',
        p_date,
        p_amount,
        p_party_id,
        p_invoice_id,
        p_mode,
        v_narration,
        CASE WHEN p_mode = 'cheque' THEN p_cheque_no ELSE NULL END,
        CASE WHEN p_mode = 'cheque' THEN p_cheque_date ELSE NULL END,
        CASE WHEN p_mode = 'cheque' THEN p_bank_name ELSE NULL END,
        v_bank_account_id,
        'payment_dialog',
        p_idempotency_key      -- ← NEW: store key for future dedup
    )
    RETURNING id INTO v_voucher_id;
    
    -- Post to ledger with ENHANCED DESCRIPTION
    -- Debit to party account (reduce what they owe)
    INSERT INTO mandi.ledger_entries (
        organization_id,
        transaction_type,
        reference_id,
        contact_id,
        amount,
        debit,
        credit,
        transaction_date,
        description
    ) VALUES (
        p_organization_id,
        'receipt',
        v_voucher_id,
        p_party_id,
        p_amount,
        0,
        p_amount,
        p_date,
        v_description  -- ✅ Enhanced description with invoice number
    );
    
    -- Credit to cash/bank account (increase cash)
    INSERT INTO mandi.ledger_entries (
        organization_id,
        transaction_type,
        reference_id,
        account_id,
        amount,
        debit,
        credit,
        transaction_date,
        description
    ) VALUES (
        p_organization_id,
        'receipt',
        v_voucher_id,
        v_bank_account_id,
        p_amount,
        p_amount,
        0,
        p_date,
        v_description  -- ✅ Same enhanced description
    );
    
    RETURN QUERY SELECT 
        v_voucher_id,
        'Payment recorded successfully'::TEXT,
        COALESCE(v_bill_no, 'Advance Payment'::TEXT);
        
END;
$function$;

-- ════════════════════════════════════════════════════════════
-- FIX 10 (bonus): Drop old record_payment overload (11 params)
-- PostgreSQL created a second function with the new 12-param sig.
-- The old 11-param version is now redundant. Drop it to prevent
-- ambiguity. The new version handles all existing calls (the 12th
-- param has DEFAULT NULL so callers passing 11 args still match).
-- ════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS mandi.record_payment(uuid, uuid, numeric, date, text, uuid, text, text, date, text, uuid);

-- ════════════════════════════════════════════════════════════
-- FIX 11 (bonus): Convert core schema views to SECURITY INVOKER
-- The security advisor flagged core.audit_log and 
-- core.view_admin_audit_logs as SECURITY DEFINER views.
-- ════════════════════════════════════════════════════════════
ALTER VIEW core.audit_log SET (security_invoker = true);
ALTER VIEW core.view_admin_audit_logs SET (security_invoker = true);

COMMIT;
