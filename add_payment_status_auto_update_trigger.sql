-- ===================================================================================
-- Auto-Update Payment Status Trigger
-- ===================================================================================
-- When amount_received changes, automatically recalculate payment_status
-- ===================================================================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS auto_update_payment_status ON mandi.sales CASCADE;
DROP FUNCTION IF EXISTS mandi.auto_update_payment_status() CASCADE;

-- Create function to auto-update payment_status
CREATE OR REPLACE FUNCTION mandi.auto_update_payment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only recalculate if amount_received changed
    IF (TG_OP = 'UPDATE' AND NEW.amount_received IS DISTINCT FROM OLD.amount_received) OR
       (TG_OP = 'UPDATE' AND NEW.total_amount_inc_tax IS DISTINCT FROM OLD.total_amount_inc_tax) THEN
        
        NEW.payment_status := CASE
            WHEN COALESCE(NEW.amount_received, 0) >= COALESCE(NEW.total_amount_inc_tax, 0) THEN 'paid'
            WHEN COALESCE(NEW.amount_received, 0) > 0 THEN 'partial'
            ELSE 'pending'
        END;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER auto_update_payment_status
BEFORE UPDATE ON mandi.sales
FOR EACH ROW
EXECUTE FUNCTION mandi.auto_update_payment_status();

-- ===================================================================================
-- Test the trigger with the partial payment
-- ===================================================================================

-- Update the invoice to verify trigger works
UPDATE mandi.sales
SET amount_received = 10000
WHERE id = 'b76034a4-ce81-4406-a2b2-e2b4fb373a11'
AND total_amount_inc_tax = 20000;

-- Verify it now shows 'partial'
SELECT 
    id,
    total_amount_inc_tax,
    amount_received,
    payment_status
FROM mandi.sales
WHERE id = 'b76034a4-ce81-4406-a2b2-e2b4fb373a11';
