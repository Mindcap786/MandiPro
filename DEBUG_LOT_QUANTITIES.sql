-- ============================================================
-- DEBUG QUERY 1: Check recent sales and their quantities
-- ============================================================
SELECT
  s.id as sale_id,
  s.bill_no,
  s.organization_id as sale_org_id,
  si.lot_id,
  si.qty as sold_qty,
  l.lot_code,
  l.current_qty as current_lot_qty,
  l.organization_id as lot_org_id,
  l.initial_qty,
  s.created_at,
  CASE
    WHEN s.organization_id = l.organization_id THEN '✓ ORG MATCH'
    ELSE '✗ ORG MISMATCH'
  END as org_check,
  CASE
    WHEN si.lot_id IS NULL THEN '✗ NO LOT_ID'
    ELSE '✓ LOT_ID SET'
  END as lot_check
FROM mandi.sales s
LEFT JOIN mandi.sale_items si ON s.id = si.sale_id
LEFT JOIN mandi.lots l ON si.lot_id = l.id
WHERE s.sale_date >= '2026-04-10'
ORDER BY s.created_at DESC
LIMIT 15;

-- ============================================================
-- DEBUG QUERY 2: Check if sale_items has correct data
-- ============================================================
SELECT
  COUNT(*) as total_sale_items,
  COUNT(lot_id) as items_with_lot_id,
  COUNT(organization_id) as items_with_org_id,
  COUNT(CASE WHEN lot_id IS NULL THEN 1 END) as items_missing_lot_id
FROM mandi.sale_items
WHERE created_at >= NOW() - INTERVAL '2 days';

-- ============================================================
-- DEBUG QUERY 3: Check lot update history
-- ============================================================
SELECT
  id,
  lot_code,
  current_qty,
  initial_qty,
  updated_at,
  EXTRACT(EPOCH FROM (NOW() - updated_at)) / 3600 as hours_since_update
FROM mandi.lots
WHERE updated_at >= NOW() - INTERVAL '24 hours'
ORDER BY updated_at DESC
LIMIT 20;

-- ============================================================
-- DEBUG QUERY 4: Look for the Apple lot specifically
-- ============================================================
SELECT
  id,
  lot_code,
  current_qty,
  initial_qty,
  organization_id,
  arrival_id,
  updated_at
FROM mandi.lots
WHERE lot_code LIKE '%260412%' OR lot_code LIKE '%Apple%'
LIMIT 10;