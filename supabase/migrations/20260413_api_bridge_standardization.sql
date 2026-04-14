-- API Bridge Standardization: Professional ERP Architecture
-- Targets: Sales, Purchases, Reporting, and Finance Adjustments

BEGIN;

-- 1. Bridge: confirm_sale_transaction
-- Purpose: Master API entrance for all Sale Transactions
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
    p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
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
        p_bank_account_id => p_bank_account_id,
        p_cheque_no => p_cheque_no,
        p_cheque_date => p_cheque_date,
        p_bank_name => p_bank_name,
        p_discount_amount => p_discount_amount,
        p_tax_details => p_tax_details,
        p_is_gst_sale => p_is_gst_sale,
        p_created_by => p_created_by
    );
END;
$$;

-- 2. Bridge: get_daybook_transactions
-- Purpose: Primary Reporting Bridge for Daily Financial Oversight
CREATE OR REPLACE FUNCTION public.get_daybook_transactions(
    p_organization_id uuid DEFAULT auth.uid(),
    p_from_date date DEFAULT CURRENT_DATE,
    p_to_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    transaction_id uuid,
    transaction_date date,
    transaction_type text,
    description text,
    party_name text,
    debit numeric,
    credit numeric,
    running_balance numeric,
    metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, public, extensions
AS $$
BEGIN
    RETURN QUERY SELECT * FROM mandi.get_daybook_transactions(
        p_organization_id => p_organization_id,
        p_from_date => p_from_date,
        p_to_date => p_to_date
    );
END;
$$;

-- 3. Bridge: record_quick_purchase
-- Purpose: Streamlined Purchase + Arrival Entry Bridge
CREATE OR REPLACE FUNCTION public.record_quick_purchase(
    p_organization_id uuid,
    p_supplier_id uuid,
    p_arrival_date date,
    p_arrival_type text,
    p_items jsonb,
    p_advance numeric DEFAULT 0,
    p_advance_payment_mode text DEFAULT 'cash',
    p_advance_bank_account_id uuid DEFAULT NULL,
    p_advance_cheque_no text DEFAULT NULL,
    p_advance_cheque_date date DEFAULT NULL,
    p_advance_bank_name text DEFAULT NULL,
    p_advance_cheque_status boolean DEFAULT false,
    p_clear_instantly boolean DEFAULT false,
    p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, public, extensions
AS $$
BEGIN
    RETURN mandi.record_quick_purchase(
        p_organization_id => p_organization_id,
        p_supplier_id => p_supplier_id,
        p_arrival_date => p_arrival_date,
        p_arrival_type => p_arrival_type,
        p_items => p_items,
        p_advance => p_advance,
        p_advance_payment_mode => p_advance_payment_mode,
        p_advance_bank_account_id => p_advance_bank_account_id,
        p_advance_cheque_no => p_advance_cheque_no,
        p_advance_cheque_date => p_advance_cheque_date,
        p_advance_bank_name => p_advance_bank_name,
        p_advance_cheque_status => p_advance_cheque_status,
        p_clear_instantly => p_clear_instantly,
        p_created_by => p_created_by
    );
END;
$$;

-- 4. Bridge: adjust_liquid_balance
-- Purpose: Financial Adjustment API Bridge
CREATE OR REPLACE FUNCTION public.adjust_liquid_balance(
    p_organization_id uuid,
    p_account_id uuid,
    p_amount numeric,
    p_adjustment_type text,
    p_description text,
    p_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, public, extensions
AS $$
BEGIN
    RETURN mandi.adjust_liquid_balance(
        p_organization_id => p_organization_id,
        p_account_id => p_account_id,
        p_amount => p_amount,
        p_adjustment_type => p_adjustment_type,
        p_description => p_description,
        p_date => p_date
    );
END;
$$;

-- 5. Bridge: transfer_liquid_funds
-- Purpose: Direct Transfer (Bank to Cash / Cash to Bank) Bridge
CREATE OR REPLACE FUNCTION public.transfer_liquid_funds(
    p_organization_id uuid,
    p_from_account_id uuid,
    p_to_account_id uuid,
    p_amount numeric,
    p_description text,
    p_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, public, extensions
AS $$
BEGIN
    RETURN mandi.transfer_liquid_funds(
        p_organization_id,
        p_from_account_id,
        p_to_account_id,
        p_amount,
        p_description,
        p_date
    );
END;
$$;

-- 6. Bridge: record_advance_payment
-- Purpose: Advance Payment Registration Bridge
CREATE OR REPLACE FUNCTION public.record_advance_payment(
    p_organization_id uuid,
    p_contact_id uuid,
    p_amount numeric,
    p_payment_mode text,
    p_bank_account_id uuid DEFAULT NULL,
    p_cheque_no text DEFAULT NULL,
    p_cheque_date date DEFAULT NULL,
    p_bank_name text DEFAULT NULL,
    p_description text DEFAULT 'Advance Payment',
    p_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, public, extensions
AS $$
BEGIN
    RETURN mandi.record_advance_payment(
        p_organization_id,
        p_contact_id,
        p_amount,
        p_payment_mode,
        p_bank_account_id,
        p_cheque_no,
        p_cheque_date,
        p_bank_name,
        p_description,
        p_date
    );
END;
$$;

-- 7. Bridge: get_account_balance
-- Purpose: Real-time Account Balance Retrieval Bridge
CREATE OR REPLACE FUNCTION public.get_account_balance(
    p_account_id uuid,
    p_organization_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, public, extensions
AS $$
BEGIN
    RETURN mandi.get_account_balance(p_account_id, p_organization_id);
END;
$$;

COMMIT;
