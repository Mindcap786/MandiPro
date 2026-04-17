-- Create mandi.clear_cheque RPC for cheque clearing
CREATE OR REPLACE FUNCTION mandi.clear_cheque(
    p_voucher_id uuid,
    p_bank_account_id uuid,
    p_clear_date timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_voucher_record RECORD;
BEGIN
    -- 1. Get voucher details
    SELECT * INTO v_voucher_record
    FROM mandi.vouchers
    WHERE id = p_voucher_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Voucher not found');
    END IF;

    -- 2. Update voucher status
    UPDATE mandi.vouchers
    SET is_cleared = true,
        cleared_at = p_clear_date,
        cheque_status = 'Cleared'
    WHERE id = p_voucher_id;

    -- 3. Update related sale status if it exists
    -- We match by organization, cheque number and date
    UPDATE mandi.sales
    SET is_cheque_cleared = true,
        payment_status = 'paid'
    WHERE organization_id = v_voucher_record.organization_id
      AND cheque_no = v_voucher_record.cheque_no
      AND (cheque_date = v_voucher_record.cheque_date OR v_voucher_record.cheque_date IS NULL)
      AND is_cheque_cleared = false;

    RETURN jsonb_build_object('success', true, 'message', 'Cheque cleared successfully');
END;
$function$;
