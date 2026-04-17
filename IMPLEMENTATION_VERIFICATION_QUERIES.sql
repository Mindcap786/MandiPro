-- =============================================================================
-- VERIFICATION QUERIES - RUN THESE TO CONFIRM IMPLEMENTATION
-- =============================================================================

-- 1. Verify database schema changes
SELECT 
  'ledger_entries columns' as check_name,
  COUNT(*) as new_columns_count
FROM information_schema.columns 
WHERE table_schema = 'mandi' 
  AND table_name = 'ledger_entries'
  AND column_name IN ('bill_number', 'lot_items_json', 'payment_against_bill_number');

-- 2. Verify indexes were created
SELECT 
  indexname,
  tablename
FROM pg_indexes 
WHERE schemaname = 'mandi' 
  AND indexname LIKE 'idx_ledger%bill%';

-- 3. Verify trigger was created  
SELECT 
  trigger_name,
  event_object_schema,
  event_object_table,
  action_statement
FROM information_schema.triggers 
WHERE trigger_schema = 'mandi'
  AND trigger_name LIKE '%bill_detail%';

-- 4. Check how many existing ledger entries have bill numbers  
SELECT 
  COUNT(*) as total_entries,
  COUNT(CASE WHEN bill_number IS NOT NULL THEN 1 END) as with_bill_number,
  COUNT(CASE WHEN lot_items_json IS NOT NULL THEN 1 END) as with_lot_items,
  COUNT(CASE WHEN payment_against_bill_number IS NOT NULL THEN 1 END) as with_payment_link
FROM mandi.ledger_entries;

-- 5. Sample ledger entries with bill details
SELECT 
  id,
  bill_number,
  transaction_type,
  description,
  debit,
  credit,
  lot_items_json
FROM mandi.ledger_entries
WHERE bill_number IS NOT NULL
LIMIT 10;

-- 6. Verify no data was deleted or changed (integrity check)
SELECT 
  (SELECT COUNT(*) FROM mandi.ledger_entries) as ledger_count,
  (SELECT COUNT(*) FROM mandi.sales) as sales_count,
  (SELECT COUNT(*) FROM mandi.arrivals) as arrivals_count,
  (SELECT SUM(debit) FROM mandi.ledger_entries) as total_debits,
  (SELECT SUM(credit) FROM mandi.ledger_entries) as total_credits;

-- 7. Verify double-entry bookkeeping (debits = credits)
SELECT 
  ROUND(SUM(debit) - SUM(credit), 2) as ledger_balance,
  CASE 
    WHEN ABS(ROUND(SUM(debit) - SUM(credit), 2)) < 0.01 THEN 'PASS: Double-entry verified'
    ELSE 'FAIL: Imbalance detected'
  END as verification
FROM mandi.ledger_entries;

-- 8. Sales data integrity (no changes)
SELECT 
  'Sales records' as check_type,
  COUNT(*) as count,
  SUM(total_amount_inc_tax) as total_value
FROM mandi.sales;

-- 9. Purchase data integrity (no changes)
SELECT 
  'Purchase records' as check_type,
  COUNT(*) as count,
  SUM(initial_qty * supplier_rate) as total_value
FROM mandi.lots;

-- 10. Check payment status calculations (should be unchanged)
SELECT 
  payment_status,
  COUNT(*) as count
FROM mandi.sales
GROUP BY payment_status
ORDER BY payment_status;
