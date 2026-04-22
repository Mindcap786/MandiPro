-- 1. Patch auto_update_payment_status to use the full total (inc tax/fees)
CREATE OR REPLACE FUNCTION mandi.auto_update_payment_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_effective_received numeric;
    v_full_total numeric;
BEGIN
    -- Calculate full total from all fee/tax columns
    v_full_total := COALESCE(NEW.total_amount, 0) + 
                    COALESCE(NEW.gst_total, 0) + 
                    COALESCE(NEW.market_fee, 0) + 
                    COALESCE(NEW.nirashrit, 0) + 
                    COALESCE(NEW.misc_fee, 0) + 
                    COALESCE(NEW.loading_charges, 0) + 
                    COALESCE(NEW.unloading_charges, 0) + 
                    COALESCE(NEW.other_expenses, 0) - 
                    COALESCE(NEW.discount_amount, 0);

    -- For pending/uncleared cheques, the money is not yet received
    IF COALESCE(NEW.payment_mode, '') = 'cheque' AND COALESCE(NEW.cheque_status, false) = false THEN
        v_effective_received := 0;  -- Cheque not cleared = not paid yet
    ELSE
        v_effective_received := COALESCE(NEW.amount_received, 0);
    END IF;

    -- Use a small epsilon (0.1) to handle floating point rounding
    IF v_effective_received >= (v_full_total - 0.1) AND v_full_total > 0 THEN
        NEW.payment_status := 'paid';
    ELSIF v_effective_received > 0.1 THEN
        NEW.payment_status := 'partial';
    ELSIF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
        NEW.payment_status := 'overdue';
    ELSE
        NEW.payment_status := 'pending';
    END IF;

    -- Sync balance_due while we are here
    NEW.balance_due := v_full_total - v_effective_received;

    RETURN NEW;
END;
$function$;

-- 2. Patch update_sale_payment_status_from_ledger to be more accurate
CREATE OR REPLACE FUNCTION mandi.update_sale_payment_status_from_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_total_paid NUMERIC;
    v_total_bill NUMERIC;
    v_ref_id UUID;
BEGIN
    v_ref_id := COALESCE(NEW.reference_id, OLD.reference_id);
    
    -- Check if this ledger entry is related to a sale
    IF v_ref_id IS NULL OR NOT EXISTS (SELECT 1 FROM mandi.sales WHERE id = v_ref_id) THEN
        RETURN NULL;
    END IF;

    -- Calculate Total Paid from all related payment types (sum of CREDITs to the party account)
    SELECT COALESCE(SUM(credit), 0) INTO v_total_paid
    FROM mandi.ledger_entries
    WHERE reference_id = v_ref_id 
      AND transaction_type IN ('sale_payment', 'receipt', 'payment');

    -- Update Sale Record - this will trigger auto_update_payment_status above
    UPDATE mandi.sales
    SET 
        amount_received = v_total_paid,
        paid_amount = v_total_paid
    WHERE id = v_ref_id;

    RETURN NULL;
END;
$function$;
