# 📊 DAILY MONITORING & QUICK REFERENCE
## Check Ledger Health in 2 Minutes

---

## 🔴 RED FLAG CHECKS (Do This Every Morning)

### Check 1: Is Ledger Balanced?

```sql
SELECT * FROM mandi.v_ledger_balance_check;
```

**What to expect**:
```
status: BALANCED ✓
```

**If you see**:
```
status: IMBALANCED ⚠️ ALERT!
```
↓ **ACTION REQUIRED** → See "Emergency Response" section below

---

### Check 2: Are There Any Sync Errors?

```sql
SELECT * FROM mandi.v_recent_sync_errors LIMIT 5;
```

**What to expect**:
```
(empty result) - no rows
```

**If you see**:
```
error_code    | error_message                | error_timestamp
REF_NOT_FOUND | Sale reference_id not found  | 2026-04-13 10:15
```
↓ **ACTION REQUIRED** → See "Fix Sync Error" section below

---

### Check 3: Are There Unsynced Ledger Entries?

```sql
SELECT COUNT(*) as unsynced_count
FROM mandi.ledger_entries
WHERE was_synced_successfully = FALSE;
```

**What to expect**:
```
unsynced_count: 0
```

**If you see**:
```
unsynced_count: 5
```
↓ **ACTION REQUIRED** → See "Fix Unsynced Entry" section below

---

## ✅ QUICK REFERENCE COMMANDS

### Run Full Health Check (Copy & Paste)

```sql
-- 1. Balance status
SELECT 
    'BALANCE CHECK' as test,
    total_debits,
    total_credits,
    balance_difference,
    balance_status
FROM mandi.v_ledger_balance_check;

-- 2. Recent errors
SELECT 
    'ERROR CHECK' as test,
    COUNT(*) as unresolved_errors
FROM mandi.ledger_sync_errors
WHERE is_resolved = FALSE;

-- 3. Unsynced entries
SELECT 
    'SYNC CHECK' as test,
    COUNT(*) as unsynced_entries
FROM mandi.ledger_entries
WHERE was_synced_successfully = FALSE;
```

---

## 🚨 IF SOMETHING IS WRONG

### Scenario 1: Ledger is IMBALANCED

```sql
-- Step 1: See which transaction types are imbalanced
SELECT 
    transaction_type,
    SUM(COALESCE(debit, 0))::NUMERIC(15,2) as debits,
    SUM(COALESCE(credit, 0))::NUMERIC(15,2) as credits,
    (SUM(COALESCE(debit, 0)) - SUM(COALESCE(credit, 0)))::NUMERIC(15,2) as difference
FROM mandi.ledger_entries
GROUP BY transaction_type
ORDER BY ABS(difference) DESC;

-- Step 2: If one type is way off, investigate that type
SELECT 
    reference_no,
    debit,
    credit,
    created_at
FROM mandi.ledger_entries
WHERE transaction_type = 'purchase_draft'  -- Replace with the problematic type
ORDER BY created_at DESC
LIMIT 10;

-- Step 3: Contact your database admin with this information
-- They will help reconcile the old data
```

---

### Scenario 2: Sync Errors Are Appearing

```sql
-- Step 1: See latest errors
SELECT 
    error_timestamp,
    transaction_type,
    error_code,
    error_message
FROM mandi.ledger_sync_errors
WHERE is_resolved = FALSE
ORDER BY error_timestamp DESC
LIMIT 10;

-- Step 2: If multiple of same error, it's a pattern
SELECT 
    error_code,
    COUNT(*) as frequency,
    STRING_AGG(DISTINCT error_message, '; ') as messages
FROM mandi.ledger_sync_errors
WHERE is_resolved = FALSE
GROUP BY error_code
ORDER BY frequency DESC;

-- Step 3: Escalate to development team with error_code and list of affected entries
```

---

### Scenario 3: Can't Create Arrival/Sale/Payment

**Error message**: "Ledger Sync Failed" or "Transaction Failed"

```sql
-- Step 1: Check what error just occurred
SELECT 
    error_code,
    error_message,
    error_details,
    error_timestamp
FROM mandi.ledger_sync_errors
ORDER BY error_timestamp DESC
LIMIT 1;

-- Step 2: Share error details with dev team
-- Include: error_code, error_message, error_details

-- Step 3: Try again after dev team confirms fix
```

---

## 📈 WEEKLY REPORTS

### Run on Monday Morning

```sql
-- Error Summary for Last Week
SELECT 
    DATE(error_timestamp)::TEXT as date,
    error_code,
    COUNT(*) as count,
    COUNT(CASE WHEN is_resolved THEN 1 END) as resolved,
    COUNT(CASE WHEN NOT is_resolved THEN 1 END) as pending
FROM mandi.ledger_sync_errors
WHERE error_timestamp > NOW() - INTERVAL '7 days'
GROUP BY DATE(error_timestamp), error_code
ORDER BY date DESC, count DESC;

-- Transaction Volume
SELECT 
    DATE(created_at)::TEXT as date,
    transaction_type,
    COUNT(*) as entries_created,
    SUM(COALESCE(debit, 0))::NUMERIC(15,2) as total_debits,
    SUM(COALESCE(credit, 0))::NUMERIC(15,2) as total_credits
FROM mandi.ledger_entries
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at), transaction_type
ORDER BY date DESC;
```

---

## 🔧 EMERGENCY PROCEDURES

### If Ledger is SEVERELY Imbalanced (>100K difference)

```
1. STOP all transaction processing (stop recording sales/arrivals)
2. RUN data audit:
   SELECT * FROM mandi.v_ledger_balance_check;
   
3. TAKE BACKUP:
   -- Document current state before any fixes
   
4. INVESTIGATE:
   SELECT * FROM mandi.ledger_sync_errors WHERE is_resolved = FALSE;
   
5. ESCALATE to Database Admin + Finance Team
   -- This needs expert review before fixing
```

---

### If MANY Sync Errors Appeared Suddenly

```
This suggests:
- Schema was modified (column removed/renamed)
- RPC function was updated incorrectly
- Database connection issue
- Corrupted data in references tables

ACTIONS:
1. Check if recent deployment occurred
   → Rollback if possible
   
2. Verify schema hasn't changed:
   SELECT column_name FROM information_schema.columns
   WHERE table_schema = 'mandi' 
     AND table_name IN ('arrivals', 'sales', 'lots', 'sale_items')
   ORDER BY table_name, ordinal_position;
   
3. Check if foreign keys are OK:
   SELECT * FROM mandi.arrivals WHERE id IS NULL;
   SELECT * FROM mandi.sales WHERE id IS NULL;
   
4. Contact dev team with error patterns
```

---

## 📊 DASHBOARD CHECKLIST

### Create Supabase Dashboard with These Charts

```
1. CHART: Real-Time Balance Status
   Query: SELECT * FROM mandi.v_ledger_balance_check
   Show: Balance difference and status
   
2. CHART: Error Rate Trend
   Query: 
   SELECT DATE(error_timestamp), COUNT(*) as errors
   FROM mandi.ledger_sync_errors
   GROUP BY DATE(error_timestamp)
   
3. CHART: Unsynced Entries
   Query:
   SELECT COUNT(*) as unsynced
   FROM mandi.ledger_entries
   WHERE was_synced_successfully = FALSE
   
4. TABLE: Recent Errors
   Query: SELECT * FROM mandi.v_recent_sync_errors
   LIMIT: 20
   
5. TABLE: Failures by Type
   Query:
   SELECT error_code, COUNT(*) as frequency
   FROM mandi.ledger_sync_errors
   WHERE is_resolved = FALSE
   GROUP BY error_code
```

---

## ✅ DAILY CHECKLIST (60 Seconds)

- [ ] Run: `SELECT * FROM mandi.v_ledger_balance_check`
- [ ] Check Status = "BALANCED ✓"
- [ ] Run: `SELECT * FROM mandi.v_recent_sync_errors LIMIT 1`
- [ ] Check: No rows returned (empty)
- [ ] Result: System is HEALTHY ✓

**If any check fails** → Follow emergency procedures above

---

## 📞 WHO TO CONTACT

| Issue | Contact | Info to Provide |
|-------|---------|-----------------|
| **Ledger Imbalanced** | Database Admin + Finance Lead | `mandi.v_ledger_balance_check` output |
| **Sync Errors Appearing** | Development Team | Error code + `error_details` JSON |
| **Can't Create Transaction** | Development Team | Last error from `mandi.v_recent_sync_errors` |
| **Schema Question** | Senior Architect | What changed in database schema |

---

## 🎯 SUCCESS INDICATORS

✅ **You're doing it right IF**:
- Balance status always shows "BALANCED ✓"
- v_recent_sync_errors is empty
- All transactions complete successfully
- No "Ledger Sync Failed" messages appear
- Financial reports match GL balance

❌ **Something's wrong IF**:
- Balance status shows "IMBALANCED ⚠️"
- Errors appear in v_recent_sync_errors
- Users report "Ledger Sync Failed" when creating transactions
- Manual reconciliation shows differences
- Auditor finds data mismatches

---

**Questions?** See ERROR_PREVENTION_AND_RECOVERY_STRATEGY.md for detailed explanations.
