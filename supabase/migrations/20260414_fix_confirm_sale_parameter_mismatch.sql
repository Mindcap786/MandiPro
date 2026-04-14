-- Fix: confirm_sale_transaction parameter mismatch
-- Issue: Public wrapper was only accepting 13 params, but mandi version expects 25+
-- Result: Sales submission was failing because all GST/fee data was being dropped
-- Fix: Update public wrapper to accept and forward ALL parameters

BEGIN;

DROP FUNCTION IF EXISTS public.confirm_sale_transaction(
    uuid, uuid, date, jsonb, text, uuid, text, date, text, numeric, jsonb, boolean, uuid
);

CREATE OR REPLACE FUNCTION public.confirm_sale_transaction(
    p_organization_id uuid,
    p_buyer_id uuid,
    p_sale_date date,
    p_items jsonb,
    p_payment_mode text DEFAULT 'credit',
    p_bank_account_id uuid DEFAULT NULL,
    p_cheque_no text DEFAULT NULL,
    p_cheque_date date DEFAULT NULL,
    p_bank_name text DEFAULT NULL,
    p_discount_amount numeric DEFAULT 0,
    p_tax_details jsonb DEFAULT '[]'::jsonb,
    p_is_gst_sale boolean DEFAULT false,
    p_created_by uuid DEFAULT auth.uid(),
    p_total_amount numeric DEFAULT 0,
    p_market_fee numeric DEFAULT 0,
    p_nirashrit numeric DEFAULT 0,
    p_misc_fee numeric DEFAULT 0,
    p_loading_charges numeric DEFAULT 0,
    p_unloading_charges numeric DEFAULT 0,
    p_other_expenses numeric DEFAULT 0,
    p_amount_received numeric DEFAULT NULL::numeric,
    p_idempotency_key text DEFAULT NULL,
    p_due_date date DEFAULT NULL,
    p_cheque_status boolean DEFAULT false,
    p_cgst_amount numeric DEFAULT 0,
    p_sgst_amount numeric DEFAULT 0,
    p_igst_amount numeric DEFAULT 0,
    p_gst_total numeric DEFAULT 0,
    p_discount_percent numeric DEFAULT 0,
    p_place_of_supply text DEFAULT NULL,
    p_buyer_gstin text DEFAULT NULL,
    p_is_igst boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, public, extensions
AS $$
BEGIN
    RETURN mandi.confirm_sale_transaction(
        p_organization_id => p_organization_id,
        p_buyer_id => p_buyer_id,
        p_sale_date => p_sale_date,
        p_items => p_items,
        p_payment_mode => p_payment_mode,
        p_total_amount => COALESCE(p_total_amount, 0),
        p_market_fee => COALESCE(p_market_fee, 0),
        p_nirashrit => COALESCE(p_nirashrit, 0),
        p_misc_fee => COALESCE(p_misc_fee, 0),
        p_loading_charges => COALESCE(p_loading_charges, 0),
        p_unloading_charges => COALESCE(p_unloading_charges, 0),
        p_other_expenses => COALESCE(p_other_expenses, 0),
        p_amount_received => p_amount_received,
        p_idempotency_key => p_idempotency_key,
        p_due_date => p_due_date,
        p_bank_account_id => p_bank_account_id,
        p_cheque_no => p_cheque_no,
        p_cheque_date => p_cheque_date,
        p_cheque_status => COALESCE(p_cheque_status, false),
        p_bank_name => p_bank_name,
        p_cgst_amount => COALESCE(p_cgst_amount, 0),
        p_sgst_amount => COALESCE(p_sgst_amount, 0),
        p_igst_amount => COALESCE(p_igst_amount, 0),
        p_gst_total => COALESCE(p_gst_total, 0),
        p_discount_percent => COALESCE(p_discount_percent, 0),
        p_discount_amount => COALESCE(p_discount_amount, 0),
        p_place_of_supply => p_place_of_supply,
        p_buyer_gstin => p_buyer_gstin,
        p_is_igst => COALESCE(p_is_igst, false)
    );
END;
$$;

COMMIT;
