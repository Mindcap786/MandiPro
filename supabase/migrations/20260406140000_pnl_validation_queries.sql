-- P&L Validation Queries
-- These queries validate the P&L calculation model:
-- PROFIT = Sale Price - Cost - Expenses + Commission

-- ===================================================================
-- Query 1: Per-Lot P&L Calculation
-- ===================================================================
-- Shows breakdown for each lot sold: Revenue, Cost, Expenses, Commission, Profit

CREATE OR REPLACE VIEW mandi.v_lot_pnl_breakdown AS
SELECT
    l.id as lot_id,
    l.lot_code,
    l.arrival_type,
    c.name as commodity_name,
    COUNT(DISTINCT si.sale_id) as num_sales,
    SUM(si.qty) as total_qty_sold,
    SUM(si.amount) as total_revenue,
    -- Cost = Amount paid to farmer/supplier (net_payable from purchase_bills)
    pb.net_payable as cost_per_lot,
    -- Expenses = Mandi paid on behalf (from lots table)
    COALESCE(l.expense_paid_by_mandi, 0) as expenses_paid_by_mandi,
    -- Commission = Kept by mandi (from purchase_bills)
    COALESCE(pb.commission_amount, 0) as commission_earned,
    -- PROFIT = Sale Price - Cost - Expenses + Commission
    (SUM(si.amount) - COALESCE(pb.net_payable, 0) - COALESCE(l.expense_paid_by_mandi, 0) + COALESCE(pb.commission_amount, 0)) as net_profit,
    -- Margin = Profit / Revenue
    CASE WHEN SUM(si.amount) > 0
        THEN ((SUM(si.amount) - COALESCE(pb.net_payable, 0) - COALESCE(l.expense_paid_by_mandi, 0) + COALESCE(pb.commission_amount, 0)) / SUM(si.amount) * 100)
        ELSE 0
    END as profit_margin_pct,
    l.organization_id,
    MAX(s.sale_date) as last_sale_date
FROM mandi.lots l
LEFT JOIN mandi.sale_items si ON l.id = si.lot_id
LEFT JOIN mandi.sales s ON si.sale_id = s.id
LEFT JOIN mandi.commodities c ON l.commodity_id = c.id
LEFT JOIN mandi.purchase_bills pb ON l.id = pb.lot_id
WHERE s.workflow_status IS NULL OR s.workflow_status != 'cancelled'
GROUP BY l.id, l.lot_code, l.arrival_type, c.name, pb.net_payable, l.expense_paid_by_mandi, pb.commission_amount, l.organization_id
ORDER BY l.created_at DESC;

-- ===================================================================
-- Query 2: Organization-Level P&L Summary
-- ===================================================================
-- Shows aggregated P&L across all lots in an organization

CREATE OR REPLACE VIEW mandi.v_organization_pnl_summary AS
SELECT
    l.organization_id,
    COUNT(DISTINCT l.id) as total_lots,
    COUNT(DISTINCT si.sale_id) as total_sales,
    SUM(si.amount) as total_revenue,
    SUM(pb.net_payable) as total_cost,
    SUM(COALESCE(l.expense_paid_by_mandi, 0)) as total_expenses,
    SUM(COALESCE(pb.commission_amount, 0)) as total_commission,
    -- PROFIT = SUM(Revenue - Cost - Expenses + Commission)
    (SUM(si.amount) - SUM(pb.net_payable) - SUM(COALESCE(l.expense_paid_by_mandi, 0)) + SUM(COALESCE(pb.commission_amount, 0))) as total_profit,
    CASE WHEN SUM(si.amount) > 0
        THEN ((SUM(si.amount) - SUM(pb.net_payable) - SUM(COALESCE(l.expense_paid_by_mandi, 0)) + SUM(COALESCE(pb.commission_amount, 0))) / SUM(si.amount) * 100)
        ELSE 0
    END as overall_margin_pct
FROM mandi.lots l
LEFT JOIN mandi.sale_items si ON l.id = si.lot_id
LEFT JOIN mandi.sales s ON si.sale_id = s.id
LEFT JOIN mandi.purchase_bills pb ON l.id = pb.lot_id
WHERE s.workflow_status IS NULL OR s.workflow_status != 'cancelled'
GROUP BY l.organization_id;

-- ===================================================================
-- Query 3: P&L by Supplier/Farmer
-- ===================================================================
-- Shows how much profit was made on goods from each supplier

CREATE OR REPLACE VIEW mandi.v_pnl_by_supplier AS
SELECT
    COALESCE(c.id, c2.id) as supplier_id,
    COALESCE(c.name, c2.name) as supplier_name,
    COALESCE(c.supplier_type, c2.supplier_type) as supplier_type,
    COUNT(DISTINCT l.id) as lots_sourced,
    COUNT(DISTINCT si.sale_id) as sales,
    SUM(si.amount) as revenue_from_sales,
    SUM(pb.net_payable) as cost_paid_to_supplier,
    SUM(COALESCE(l.expense_paid_by_mandi, 0)) as expenses_borne,
    SUM(COALESCE(pb.commission_amount, 0)) as commission_earned,
    (SUM(si.amount) - SUM(pb.net_payable) - SUM(COALESCE(l.expense_paid_by_mandi, 0)) + SUM(COALESCE(pb.commission_amount, 0))) as profit,
    l.organization_id
FROM mandi.lots l
LEFT JOIN mandi.contacts c ON l.farmer_id = c.id
LEFT JOIN mandi.contacts c2 ON l.supplier_id = c2.id
LEFT JOIN mandi.sale_items si ON l.id = si.lot_id
LEFT JOIN mandi.sales s ON si.sale_id = s.id
LEFT JOIN mandi.purchase_bills pb ON l.id = pb.lot_id
WHERE s.workflow_status IS NULL OR s.workflow_status != 'cancelled'
GROUP BY COALESCE(c.id, c2.id), COALESCE(c.name, c2.name), COALESCE(c.supplier_type, c2.supplier_type), l.organization_id
ORDER BY profit DESC;

-- ===================================================================
-- Query 4: P&L by Commodity
-- ===================================================================
-- Shows profitability of different commodities

CREATE OR REPLACE VIEW mandi.v_pnl_by_commodity AS
SELECT
    c.id as commodity_id,
    c.name as commodity_name,
    COUNT(DISTINCT l.id) as lots,
    SUM(si.qty) as total_qty,
    AVG(si.rate) as avg_sell_rate,
    SUM(si.amount) as revenue,
    SUM(pb.net_payable) as total_cost,
    SUM(COALESCE(l.expense_paid_by_mandi, 0)) as total_expenses,
    SUM(COALESCE(pb.commission_amount, 0)) as total_commission,
    (SUM(si.amount) - SUM(pb.net_payable) - SUM(COALESCE(l.expense_paid_by_mandi, 0)) + SUM(COALESCE(pb.commission_amount, 0))) as profit,
    CASE WHEN SUM(si.amount) > 0
        THEN ((SUM(si.amount) - SUM(pb.net_payable) - SUM(COALESCE(l.expense_paid_by_mandi, 0)) + SUM(COALESCE(pb.commission_amount, 0))) / SUM(si.amount) * 100)
        ELSE 0
    END as margin_pct,
    l.organization_id
FROM mandi.commodities c
LEFT JOIN mandi.lots l ON c.id = l.commodity_id
LEFT JOIN mandi.sale_items si ON l.id = si.lot_id
LEFT JOIN mandi.sales s ON si.sale_id = s.id
LEFT JOIN mandi.purchase_bills pb ON l.id = pb.lot_id
WHERE s.workflow_status IS NULL OR s.workflow_status != 'cancelled'
GROUP BY c.id, c.name, l.organization_id
ORDER BY profit DESC;

-- ===================================================================
-- Query 5: Test Case Validation
-- ===================================================================
-- Validates specific test cases from PNL_CALCULATION_MODEL.md

-- Example: Farmer Commission Purchase
-- Expected: Profit = 18,000 - 10,800 - 500 + 1,200 = 7,900

-- To test, insert sample data and verify calculation:
-- INSERT INTO mandi.lots (lot_code, arrival_type, initial_qty, supplier_rate, commission_percent, expense_paid_by_mandi)
-- VALUES ('TEST-FARMER-001', 'Farmer Commission', 100, 120, 10, 500);
--
-- INSERT INTO mandi.purchase_bills (lot_id, gross_amount, commission_amount, net_payable)
-- SELECT id, 12000, 1200, 10800 FROM mandi.lots WHERE lot_code = 'TEST-FARMER-001';
--
-- SELECT * FROM v_lot_pnl_breakdown WHERE lot_code = 'TEST-FARMER-001';
-- Should show: profit = 7,900 (Revenue 18,000 - Cost 10,800 - Expenses 500 + Commission 1,200)
