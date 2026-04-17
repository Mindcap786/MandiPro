# Step-by-Step: Apply Cheque Payment Fixes

## Prerequisites
- Access to Supabase dashboard
- Backup of database (recommended)
- Understanding of the issue (see `CHEQUE_PAYMENT_BEHAVIOR.md`)

---

## Step 1: Rename Migration Files

The user already has the SQL files prepared. Move them to the migrations folder:

```bash
cd /Users/shauddin/Desktop/MandiGrow

# Main fix - corrects the logic
mv web/fix-cheque-duplication.sql \
   supabase/migrations/20260406100000_fix_cheque_duplication.sql

# Cleanup - removes duplicates
# (Already created by Claude Code at 20260406110000_cleanup_duplicate_arrivals_ledger.sql)
```

---

## Step 2: Apply the Main Fix Migration

**In Supabase Dashboard:**

1. Go to **SQL Editor**
2. Create new query
3. Copy contents of `20260406100000_fix_cheque_duplication.sql`
4. **Execute**
5. Verify: Should see "CREATE OR REPLACE FUNCTION" messages (no errors)

**What it does:**
- Updates `post_arrival_ledger()` with UPSERT logic
- Updates `clear_cheque()` to avoid duplicate posting
- Ensures cheques behave like UPI/BANK for instant clearing

---

## Step 3: Cleanup Existing Duplicate Data

**In Supabase Dashboard:**

1. Go to **SQL Editor**
2. Create new query
3. Copy contents of `20260406110000_cleanup_duplicate_arrivals_ledger.sql`
4. **Execute** (This will DELETE duplicate vouchers and ledger entries)

**What it does:**
- Removes duplicate payment vouchers (keeps oldest)
- Deletes orphaned ledger entries
- Prepares for re-ledgering

---

## Step 4: Regenerate Arrival Ledgers

**For each affected arrival, regenerate the ledger:**

```sql
-- First, find all arrivals with cheque payments
SELECT DISTINCT v.arrival_id, a.bill_no, c.name as party
FROM mandi.vouchers v
JOIN mandi.arrivals a ON v.arrival_id = a.id
JOIN mandi.contacts c ON a.party_id = c.id
WHERE v.arrival_id IS NOT NULL
  AND v.type IN ('payment', 'cheque')
  AND a.organization_id = '{{ YOUR_ORG_ID }}'
ORDER BY a.created_at DESC;
```

**Then regenerate each arrival:**

```sql
-- Run for each arrival_id from above query
SELECT mandi.post_arrival_ledger('{{ ARRIVAL_ID }}'::uuid);
```

**Example:** If you have 5 arrivals with cheque payments, run this 5 times with different arrival IDs.

---

## Step 5: Verify the Fix

**Check that duplicates are gone:**

```sql
-- Query to verify no duplicates remain
SELECT
    a.id as arrival_id,
    a.bill_no,
    c.name as party_name,
    COUNT(DISTINCT v.id) as payment_voucher_count,
    COUNT(DISTINCT le.voucher_id) as unique_vouchers_with_entries
FROM mandi.arrivals a
LEFT JOIN mandi.contacts c ON a.party_id = c.id
LEFT JOIN mandi.vouchers v ON a.id = v.arrival_id AND v.type IN ('payment', 'cheque')
LEFT JOIN mandi.ledger_entries le ON v.id = le.voucher_id
WHERE a.organization_id = '{{ YOUR_ORG_ID }}'
GROUP BY a.id, a.bill_no, c.name
ORDER BY a.created_at DESC;
```

**Expected Result:**
- Each arrival should have **only 1 payment voucher** (or 0 if no advance payment)
- Ledger entries should show single transaction per voucher

---

## Step 6: Test in Frontend

### Test Case 1: Instant Cheque
1. Go to **Arrivals**
2. Create new arrival with:
   - Supplier: Any farmer/supplier
   - Item: Apple, 100 boxes @ ₹100 = ₹10,000
   - Advance Payment Mode: **Cheque**
   - Amount: ₹10,000
   - Cleared Instantly: **ON** ✓
   - Cheque No: 54321
3. Click Save
4. Go to **Finance > Day Book**
5. **Verify:** Should see **ONE transaction** with:
   - Debit Purchase ₹10,000
   - Credit Bank ₹10,000

### Test Case 2: Pending Cheque (Clear Later)
1. Go to **Arrivals**
2. Create new arrival with:
   - Supplier: Any farmer/supplier
   - Item: Mango, 50 boxes @ ₹200 = ₹10,000
   - Advance Payment Mode: **Cheque**
   - Amount: ₹10,000
   - Cleared Instantly: **OFF** ⏳
   - Cheque No: 54322
   - Clear Date: 2026-04-20
3. Click Save
4. Go to **Finance > Day Book**
5. **Verify:** Should see **ONE transaction** (purchase only)
6. Go to **Finance > Cheque Management**
7. Click **Clear** for the cheque
8. Go back to **Day Book**
9. **Verify:** Should now see **TWO transactions** (purchase + payment)

### Test Case 3: No Duplicates
1. Go to **Finance > Day Book**
2. Filter by date of today
3. **Search:** "new farmer" or "Anji"
4. **Verify:** 
   - ❌ No duplicate ₹13,000 entries
   - ✅ Each purchase shows only once
   - ✅ Transport charges included in one entry

---

## Rollback Plan (If Needed)

If something goes wrong, you can rollback:

```sql
-- Restore from backup or run:
-- 1. Drop the updated functions
DROP FUNCTION IF EXISTS mandi.post_arrival_ledger(uuid);
DROP FUNCTION IF EXISTS mandi.clear_cheque(uuid, uuid, timestamp with time zone);

-- 2. Re-apply from previous migration 20260405100000_finance_feedback_fixes.sql
```

---

## Expected Results After Fix

| Metric | Before | After |
|--------|--------|-------|
| Day Book Entries per Instant Cheque | 2-3 (duplicated) | 1 (clean) |
| Payment Vouchers per Arrival | 2+ | 1 |
| "new farmer" ₹12k purchase shows as | ₹13,000 duplicate | Single entry with transport netted |
| Cheque clearing creates duplicate | YES ❌ | NO ✅ |
| Ledger integrity | Broken | Fixed |

---

## Support

If issues occur during migration:

1. **Check migration logs** in Supabase (Settings > Logs)
2. **Verify organization_id** is correctly substituted in queries
3. **Contact:** Include day-book screenshots showing the issue

---

## Timeline

- **Migration 1:** `20260406100000_fix_cheque_duplication.sql` → ~5 seconds
- **Cleanup:** `20260406110000_cleanup_duplicate_arrivals_ledger.sql` → ~10 seconds
- **Regeneration:** 1-2 seconds per arrival
- **Total time:** ~5-10 minutes

**Downtime:** None (can be done in background, no frontend restart needed)
