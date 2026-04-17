-- Backfill total_amount_inc_tax for existing sales records
-- This migration calculates and updates total_amount_inc_tax for all records where it's currently 0 or NULL

UPDATE sales
SET total_amount_inc_tax = 
    COALESCE(total_amount, 0) + 
    COALESCE(market_fee, 0) + 
    COALESCE(nirashrit, 0) + 
    COALESCE(misc_fee, 0) + 
    COALESCE(loading_charges, 0) + 
    COALESCE(unloading_charges, 0) + 
    COALESCE(other_expenses, 0)
WHERE total_amount_inc_tax IS NULL OR total_amount_inc_tax = 0;

-- Verify the update
SELECT 
    bill_no,
    total_amount,
    market_fee,
    nirashrit,
    misc_fee,
    loading_charges,
    unloading_charges,
    other_expenses,
    total_amount_inc_tax,
    total_amount + COALESCE(market_fee, 0) + COALESCE(nirashrit, 0) + COALESCE(misc_fee, 0) + 
    COALESCE(loading_charges, 0) + COALESCE(unloading_charges, 0) + COALESCE(other_expenses, 0) as calculated_total
FROM sales
ORDER BY bill_no DESC
LIMIT 10;
