-- 1. Correct the sales table schema
ALTER TABLE mandi.sales ADD COLUMN IF NOT EXISTS cheque_no TEXT;
ALTER TABLE mandi.sales ADD COLUMN IF NOT EXISTS cheque_date DATE;
ALTER TABLE mandi.sales ADD COLUMN IF NOT EXISTS cheque_status BOOLEAN DEFAULT false;

-- 2. Rename columns if they were incorrectly named (Audit)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='mandi' AND table_name='sales' AND column_name='is_cheque_cleared') THEN
        ALTER TABLE mandi.sales RENAME COLUMN is_cheque_cleared TO cheque_status;
    END IF;
END $$;

-- 3. Update the RPC to use standardized names
CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id uuid,
    p_buyer_id uuid,
    p_sale_date date,
    p_payment_mode text,
    p_total_amount numeric,
    p_items jsonb,
    p_market_fee numeric DEFAULT 0,
    p_nirashrit numeric DEFAULT 0,
    p_misc_fee numeric DEFAULT 0,
    p_loading_charges numeric DEFAULT 0,
    p_unloading_charges numeric DEFAULT 0,
    p_other_expenses numeric DEFAULT 0,
    p_idempotency_key uuid DEFAULT NULL::uuid,
    p_due_date date DEFAULT NULL::date,
    p_bank_account_id uuid DEFAULT NULL::uuid,
    p_cheque_no text DEFAULT NULL::text,
    p_cheque_date date DEFAULT NULL::date,
    p_cheque_status boolean DEFAULT false,
    p_amount_received numeric DEFAULT 0,
    p_cgst_amount numeric DEFAULT 0,
    p_sgst_amount numeric DEFAULT 0,
    p_igst_amount numeric DEFAULT 0,
    p_gst_total numeric DEFAULT 0,
    p_discount_percent numeric DEFAULT 0,
    p_discount_amount numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_sale_id          uuid;
    v_voucher_id       uuid;
    v_bill_no          bigint;
    v_item             jsonb;
    v_payment_status   text;
BEGIN
    -- 1. Determine Payment Status
    v_payment_status := CASE
        WHEN p_payment_mode IN ('cash', 'upi', 'bank_transfer', 'UPI/BANK', 'bank_upi') THEN 'paid'
        WHEN p_payment_mode IN ('cheque', 'CHEQUE') AND p_cheque_status = true THEN 'paid'
        ELSE 'pending'
    END;

    -- 2. Insert Sale Shell
    v_bill_no := core.next_sale_no(p_organization_id);
    
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, payment_mode, total_amount, bill_no,
        market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, other_expenses,
        payment_status, idempotency_key, due_date,
        cheque_no, cheque_date, cheque_status,
        cgst_amount, sgst_amount, igst_amount, gst_total,
        discount_percent, discount_amount
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, p_payment_mode, 
        ROUND(p_total_amount::NUMERIC, 2), v_bill_no,
        ROUND(COALESCE(p_market_fee, 0)::NUMERIC, 2),
        ROUND(COALESCE(p_nirashrit, 0)::NUMERIC, 2),
        ROUND(COALESCE(p_misc_fee, 0)::NUMERIC, 2),
        ROUND(COALESCE(p_loading_charges, 0)::NUMERIC, 2),
        ROUND(COALESCE(p_unloading_charges, 0)::NUMERIC, 2),
        ROUND(COALESCE(p_other_expenses, 0)::NUMERIC, 2),
        v_payment_status, p_idempotency_key, p_due_date,
        p_cheque_no, p_cheque_date, p_cheque_status,
        ROUND(COALESCE(p_cgst_amount, 0), 2),
        ROUND(COALESCE(p_sgst_amount, 0), 2),
        ROUND(COALESCE(p_igst_amount, 0), 2),
        ROUND(COALESCE(p_gst_total, 0), 2),
        ROUND(COALESCE(p_discount_percent, 0), 2),
        ROUND(COALESCE(p_discount_amount, 0), 2)
    ) RETURNING id INTO v_sale_id;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no);
END;
$function$;
