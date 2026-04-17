# QUICK REFERENCE - VERIFICATION QUERIES

## 🟢 VERIFY ALL FIXES ARE WORKING

Copy/paste these queries into Supabase SQL editor to verify the fixes:

---

## 1. VERIFY Hizan Balance (₹20,000)

```sql
-- Test: Hizan should show ₹20,000 outstanding
SELECT mandi.get_ledger_statement(
    '41d7df13-1d5e-467a-92e8-5b120d462a3d'::uuid
) as hizan;
```

**Expected**: `closing_balance: 20000`  
**Status**: ✅ PASS if matches

---

## 2. VERIFY Faizan Balance (₹50,000)

```sql
-- Test: Faizan should show ₹50,000 outstanding (not ₹70,000!)
SELECT mandi.get_ledger_statement(
    '8fb48ab4-6487-4afe-8813-5d2cdc4d417d'::uuid
) as faizan;
```

**Expected**: `closing_balance: 50000`  
**Status**: ✅ PASS if matches

---

## 3. VERIFY Contact Type Classification

```sql
-- Test: is_creditor_type function works for all types
SELECT 
    mandi.is_creditor_type('supplier') as is_supplier_creditor,
    mandi.is_creditor_type('farmer') as is_farmer_creditor,
    mandi.is_creditor_type('party') as is_party_creditor,
    mandi.is_creditor_type('buyer') as is_buyer_creditor,
    mandi.is_creditor_type('customer') as is_customer_creditor;
```

**Expected**:
```
is_supplier_creditor  | true
is_farmer_creditor    | true
is_party_creditor     | true
is_buyer_creditor     | false
is_customer_creditor  | false
```

**Status**: ✅ PASS if matches

---

## 4. VERIFY Transaction Details Show

```sql
-- Test: Faizan's ledger shows all transactions
SELECT 
    (mandi.get_ledger_statement('8fb48ab4-6487-4afe-8813-5d2cdc4d417d'::uuid)->'transactions') as transactions,
    json_array_length(mandi.get_ledger_statement('8fb48ab4-6487-4afe-8813-5d2cdc4d417d'::uuid)->'transactions') as transaction_count;
```

**Expected**: 
- `transaction_count: 3` (Advance + 2 Bills)
- 3 array elements in transactions field
- transactions[2].balance = 50000 (final balance)

**Status**: ✅ PASS if matches

---

## 5. VERIFY Advance Payment Recorded

```sql
-- Test: Faizan's advance payment is in ledger
SELECT 
    le.transaction_type,
    le.description,
    le.debit,
    le.credit
FROM mandi.ledger_entries le
WHERE le.contact_id = '8fb48ab4-6487-4afe-8813-5d2cdc4d417d'
  AND le.transaction_type = 'advance_payment';
```

**Expected**:
```
transaction_type: advance_payment
description:      Advance Payment - CASH [LOT-260412]
debit:           20000
credit:          0
```

**Status**: ✅ PASS if returns 1 row

---

## 6. VERIFY Ledger Entries Complete

```sql
-- Test: All suppliers' ledger entries total
SELECT 
    c.name,
    c.type,
    COUNT(le.id) as entry_count,
    SUM(le.debit) as total_debits,
    SUM(le.credit) as total_credits
FROM mandi.contacts c
LEFT JOIN mandi.ledger_entries le ON c.id = le.contact_id
WHERE c.type IN ('supplier', 'farmer', 'party')
GROUP BY c.id, c.name, c.type
ORDER BY SUM(le.credit) DESC;
```

**Expected**: 
- Hizan: 2 entries (1 payment, 1 purchase bill)
- Faizan: 3 entries (1 advance, 2 purchase bills)
- No NULL entries

**Status**: ✅ PASS if shows correct counts

---

## 7. FULL AUDIT - Double-Entry Verification

```sql
-- Test: Every debit should balance with credits (double-entry)
SELECT 
    'DEBIT TOTAL' as type,
    SUM(le.debit) as amount
FROM mandi.ledger_entries le

UNION ALL

SELECT 
    'CREDIT TOTAL' as type,
    SUM(le.credit) as amount
FROM mandi.ledger_entries le;
```

**Expected**: Both should equal same amount (double-entry principle)  
**Status**: ✅ PASS if equal

---

## 8. VERIFY Trigger Exists

```sql
-- Test: Advance payment trigger is deployed
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'trg_post_lot_advance_ledger';
```

**Expected**:
```
trigger_name:       trg_post_lot_advance_ledger
event_object_table: lots
```

**Status**: ✅ PASS if returns 1 row

---

## 9. VERIFY Function Signature

```sql
-- Test: New function has is_creditor in response
SELECT 
    mandi.get_ledger_statement('8fb48ab4-6487-4afe-8813-5d2cdc4d417d'::uuid)->'is_creditor' as has_is_creditor_field,
    mandi.get_ledger_statement('8fb48ab4-6487-4afe-8813-5d2cdc4d417d'::uuid)->'contact_type' as contact_type_returned;
```

**Expected**:
```
has_is_creditor_field: true
contact_type_returned: "farmer"
```

**Status**: ✅ PASS if true and "farmer"

---

## 10. PERFORMANCE CHECK

```sql
-- Test: Function executes quickly (< 100ms)
EXPLAIN ANALYZE
SELECT mandi.get_ledger_statement('8fb48ab4-6487-4afe-8813-5d2cdc4d417d'::uuid);
```

**Expected**: 
- Planning time: < 10ms
- Total time: < 100ms

**Status**: ✅ PASS if under 100ms

---

## 11. ORGANIZATION CONTEXT TEST

```sql
-- Test: Organization auto-detection works
-- Call WITHOUT explicit org_id - should infer from contact
SELECT jsonb_pretty(mandi.get_ledger_statement(
    '8fb48ab4-6487-4afe-8813-5d2cdc4d417d'::uuid
    -- NOTE: No p_organization_id parameter
)) as auto_org_detected;
```

**Expected**: 
```json
{
  "organization_id": "76c6d2ad-a3e0-4b41-a736-ff4b7ca14da8"
}
```

**Status**: ✅ PASS if organization_id populated

---

## 12. COMPREHENSIVE TEST - All Scenarios

```sql
-- Test: Compare all supplier balances
SELECT 
    c.name,
    c.type,
    mandi.get_ledger_statement(c.id)->>'contact_type' as detected_type,
    mandi.get_ledger_statement(c.id)->>'is_creditor' as is_creditor,
    mandi.get_ledger_statement(c.id)->>'closing_balance' as balance_from_function,
    -- Manual calculation for verification
    (SUM(le.credit) - SUM(le.debit)) as balance_manual,
    COUNT(le.id) as ledger_entry_count
FROM mandi.contacts c
LEFT JOIN mandi.ledger_entries le ON c.id = le.contact_id
WHERE c.type IN ('supplier', 'farmer', 'party')
GROUP BY c.id, c.name, c.type
ORDER BY c.name;
```

**Expected**: 
- Function balance matches manual calculation for ALL contacts
- is_creditor = true for all farmer/supplier/party types

**Status**: ✅ PASS if all rows match

---

## BATCH TEST SCRIPT

Copy all at once and run:

```sql
-- BATCH: Run all verification tests
-- 1. Hizan
SELECT 'Test 1: Hizan' as test_name, 
       mandi.get_ledger_statement('41d7df13-1d5e-467a-92e8-5b120d462a3d'::uuid)->>'closing_balance' as result;

-- 2. Faizan  
SELECT 'Test 2: Faizan' as test_name,
       mandi.get_ledger_statement('8fb48ab4-6487-4afe-8813-5d2cdc4d417d'::uuid)->>'closing_balance' as result;

-- 3. Type classification
SELECT 'Test 3: Type Check' as test_name,
       CASE WHEN mandi.is_creditor_type('farmer') THEN 'PASS' ELSE 'FAIL' END as result;

-- 4. Trigger exists
SELECT 'Test 4: Trigger' as test_name,
       CASE WHEN EXISTS(SELECT 1 FROM information_schema.triggers 
            WHERE trigger_name='trg_post_lot_advance_ledger') 
            THEN 'PASS' ELSE 'FAIL' END as result;
```

---

## 🟡 IF ANY TEST FAILS

### Failure in Test 1 or 2 (Balance Wrong)
**Solutions**:
1. Clear browser cache: Cmd+Shift+R
2. Restart backend server
3. Check actual ledger entries:
   ```sql
   SELECT * FROM mandi.ledger_entries 
   WHERE contact_id = '<failing_contact_id>';
   ```

### Failure in Test 3 (Type Classification)
**Solutions**:
1. Verify function deployed:
   ```sql
   SELECT pg_get_functiondef('mandi.is_creditor_type(text)'::regprocedure);
   ```
2. Manually test:
   ```sql
   SELECT mandi.is_creditor_type('farmer');  -- Must be true
   ```

### Failure in Test 4 (Trigger)
**Solutions**:
1. Re-deploy trigger:
   ```sql
   CREATE TRIGGER trg_post_lot_advance_ledger
   AFTER UPDATE ON mandi.lots
   FOR EACH ROW
   EXECUTE FUNCTION mandi.post_lot_advance_ledger();
   ```

### Failure in Test 12 (Mismatch)
**Solutions**:
1. Find mismatched contact:
   ```sql
   -- Run Test 12, find row where function balance ≠ manual balance
   ```
2. Manually post ledger entry:
   ```sql
   INSERT INTO mandi.ledger_entries (contact_id, debit, credit, ...)
   VALUES (...);
   ```

---

## PRODUCTION CHECKLIST

Run these tests before going live:

- [ ] Test 1 (Hizan): ₹20,000 ✅
- [ ] Test 2 (Faizan): ₹50,000 ✅
- [ ] Test 3 (Types): All TRUE ✅
- [ ] Test 4 (Trigger): EXISTS ✅
- [ ] Test 12 (All): All MATCH ✅
- [ ] No errors in database logs
- [ ] Finance page displays transactions ✅
- [ ] User confirms balances match records ✅

---

## REFERENCE: Expected Values

| Contact | Type | Bills | Paid | Outstanding |
|---------|------|-------|------|-------------|
| Hizan | supplier | ₹30,000 | ₹10,000 | ₹20,000 ✅ |
| Faizan | farmer | ₹70,000 | ₹20,000 | ₹50,000 ✅ |

---

**Last Updated**: April 12, 2026  
**Quick Ref Version**: 1.0