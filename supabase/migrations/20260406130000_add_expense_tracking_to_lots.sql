-- Add expense tracking for P&L calculations
-- Tracks expenses mandi pays on behalf of farmer/supplier per lot

ALTER TABLE mandi.lots
ADD COLUMN IF NOT EXISTS expense_paid_by_mandi NUMERIC DEFAULT 0;

COMMENT ON COLUMN mandi.lots.expense_paid_by_mandi IS
'Total expenses (transport, labor, packing, etc.) that mandi paid on behalf of farmer/supplier for this lot. Used in P&L calculation as deduction from profit.';

-- Create index for efficient P&L queries
CREATE INDEX IF NOT EXISTS idx_lots_expense_paid_by_mandi
ON mandi.lots(organization_id, expense_paid_by_mandi);

-- Update purchase_bills to ensure commission_amount is properly tracked
ALTER TABLE mandi.purchase_bills
ADD COLUMN IF NOT EXISTS commission_amount NUMERIC DEFAULT 0;

COMMENT ON COLUMN mandi.purchase_bills.commission_amount IS
'Commission kept by mandi (deducted from farmer payment). This is income to mandi, not a cost. Used in P&L as addition to profit.';

-- Create index for efficient P&L queries
CREATE INDEX IF NOT EXISTS idx_purchase_bills_commission
ON mandi.purchase_bills(organization_id, commission_amount);
