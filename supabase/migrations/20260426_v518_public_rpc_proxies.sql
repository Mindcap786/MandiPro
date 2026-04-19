-- ============================================================
-- v5.18: Restore public schema proxies for get_ledger_statement
--        and confirm_sale_transaction
--
-- RCA (Michel/Chinna showing ₹0.00 Dr after v5.17 fix):
-- supabase.rpc('get_ledger_statement') routes to public schema
-- by default (PostgREST). v5.17 dropped public.get_ledger_statement
-- while only recreating mandi.get_ledger_statement.
-- → 404 PGRST202 "function not found in schema cache"
-- → Frontend receives error → shows empty ledger
--
-- FIX: Thin public-schema proxy delegating to mandi canonical.
-- This pattern must be preserved for ALL future RPC consolidations.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_ledger_statement CASCADE;
DROP FUNCTION IF EXISTS public.confirm_sale_transaction CASCADE;

-- Public proxy for ledger statement
CREATE OR REPLACE FUNCTION public.get_ledger_statement(
    p_organization_id UUID,
    p_contact_id      UUID,
    p_from_date       DATE,
    p_to_date         DATE
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
    SELECT mandi.get_ledger_statement(p_organization_id, p_contact_id, p_from_date, p_to_date);
$$;

GRANT EXECUTE ON FUNCTION public.get_ledger_statement TO authenticated;

-- Public proxy for confirm_sale_transaction (used by older POS flows)
CREATE OR REPLACE FUNCTION public.confirm_sale_transaction(
    p_organization_id   UUID,
    p_buyer_id          UUID,
    p_sale_date         DATE,
    p_payment_mode      TEXT,
    p_total_amount      NUMERIC,
    p_items             JSONB,
    p_market_fee        NUMERIC  DEFAULT 0,
    p_nirashrit         NUMERIC  DEFAULT 0,
    p_misc_fee          NUMERIC  DEFAULT 0,
    p_loading_charges   NUMERIC  DEFAULT 0,
    p_unloading_charges NUMERIC  DEFAULT 0,
    p_other_expenses    NUMERIC  DEFAULT 0,
    p_amount_received   NUMERIC  DEFAULT NULL,
    p_idempotency_key   TEXT     DEFAULT NULL,
    p_due_date          DATE     DEFAULT NULL,
    p_bank_account_id   UUID     DEFAULT NULL,
    p_cheque_no         TEXT     DEFAULT NULL,
    p_cheque_date       DATE     DEFAULT NULL,
    p_cheque_status     BOOLEAN  DEFAULT FALSE,
    p_bank_name         TEXT     DEFAULT NULL,
    p_cgst_amount       NUMERIC  DEFAULT 0,
    p_sgst_amount       NUMERIC  DEFAULT 0,
    p_igst_amount       NUMERIC  DEFAULT 0,
    p_gst_total         NUMERIC  DEFAULT 0,
    p_discount_percent  NUMERIC  DEFAULT 0,
    p_discount_amount   NUMERIC  DEFAULT 0,
    p_place_of_supply   TEXT     DEFAULT NULL,
    p_buyer_gstin       TEXT     DEFAULT NULL,
    p_is_igst           BOOLEAN  DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
    SELECT mandi.confirm_sale_transaction(
        p_organization_id, p_buyer_id, p_sale_date, p_payment_mode, p_total_amount, p_items,
        p_market_fee, p_nirashrit, p_misc_fee, p_loading_charges, p_unloading_charges, p_other_expenses,
        p_amount_received, p_idempotency_key, p_due_date, p_bank_account_id,
        p_cheque_no, p_cheque_date, p_cheque_status, p_bank_name,
        p_cgst_amount, p_sgst_amount, p_igst_amount, p_gst_total,
        p_discount_percent, p_discount_amount, p_place_of_supply, p_buyer_gstin, p_is_igst
    );
$$;

GRANT EXECUTE ON FUNCTION public.confirm_sale_transaction TO authenticated;
