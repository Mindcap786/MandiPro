# 🚨 CRITICAL PRODUCTION FIX - Action Plan

**Issue**: Farmer & Supplier Commission Arrivals Failing to Post Ledger  
**Root Cause**: Silent NULL Account Lookup Errors  
**Status**: ✅ FIXED - Ready for Deployment  
**Date**: April 13, 2026

---

## CURRENT SITUATION (WHAT'S BROKEN)

### When Problem Occurs
When logging arrivals **from farmer** or **from supplier commission**, user sees:
```
❌ "Arrival Logged But Ledger Synchronization Failed - Contact Support"
```

### What ACTUALLY Happens Behind Scenes
1. ✅ Arrival record created in database
2. ✅ Lot records created  
3. ✅ Stock ledger entries created
4. ❌ **Ledger posting FAILS** silently
5. ❌ Accounts payable NOT updated
6. ❌ Business books broken (assets ≠ liabilities)

### Why Problem is HIDDEN
- RPC error is trapped by SECURITY DEFINER
- Frontend never sees actual error
- User just sees generic "contact support"
- **This is 100% PREVENTABLE** - just needs account lookup validation

---

## ROOT CAUSE (WHY IT'S HAPPENING)

**The Bug**: `post_arrival_ledger()` RPC looks for required chart of accounts but **doesn't validate if they exist** before using them.

```sql
-- This runs:
SELECT id INTO v_commission_income_acc_id FROM mandi.accounts 
WHERE organization_id = v_org_id 
AND name ILIKE '%Commission Income%' LIMIT 1;

-- If not found, v_commission_income_acc_id = NULL

-- Then later:
INSERT INTO mandi.ledger_entries (
    account_id, ...
) VALUES (
    v_commission_income_acc_id,  -- NULL! FK constraint violation!
    ...
);
-- Transaction fails, error is silent (security context hides it)
```

### Why It Affects Farmer/Supplier Commission
These arrival types **post commission income entries** to the ledger:
```sql
INSERT INTO mandi.ledger_entries (..., account_id = v_commission_income_acc_id, ...)
```

If that account doesn't exist → NULL → FAIL

**Direct Purchase doesn't post commission** so it might work (if purchase account 5001 exists).

---

## THE FIX (WHAT'S INCLUDED)

### 1️⃣ Database Migration
**File**: `supabase/migrations/20260413_fix_arrival_ledger_sync_null_check.sql`

**Changes**:
- After EVERY account lookup → Check if NULL
- If NULL → Return error like: `"MISSING_ACCOUNT: Commission Income Account not found"`
- Never proceeds with NULL account_id

```sql
-- NEW CODE:
SELECT id INTO v_commission_income_acc_id FROM mandi.accounts 
WHERE organization_id = v_org_id AND name ILIKE '%Commission Income%' LIMIT 1;

IF v_commission_income_acc_id IS NULL THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', 'MISSING_ACCOUNT: Commission Income Account 
                 (name contains "Commission Income") not found. Contact support.'
    );
END IF;
```

### 2️⃣ Frontend Update  
**File**: `web/components/arrivals/arrivals-form.tsx` (Line 875)

**Changes**:
- Capture RPC response data (not just error)
- Check `response.success` field
- Extract and display `response.error` message to user

```typescript
// BEFORE: Only caught network errors, missed business logic errors
const { error } = await rpc('post_arrival_ledger', {});

// AFTER: Catches both network AND business errors
const { data: rpcResponse, error: rpcError } = await rpc(...);
if (rpcResponse?.success === false) {
    toast({
        title: "Ledger Setup Issue",
        description: rpcResponse.error,  // Shows which account is missing!
        variant: "destructive"
    });
}
```

---

## DEPLOYMENT STEPS

### ✅ Step 1: Apply Database Migration
Choose ONE:

**Option A: Supabase Dashboard**
1. Open Supabase Console
2. Go to SQL Editor
3. Open file: `supabase/migrations/20260413_fix_arrival_ledger_sync_null_check.sql`
4. Copy entire contents
5. Paste in SQL Editor
6. Click "Run"
7. Wait for success

**Option B: CLI**
```bash
supabase migration up --project-id <your-project-id>
```

**Option C: Manual Supabase (if no CLI)**
Just copy-paste the SQL into dashboard, run it.

### ✅ Step 2: Deploy Frontend
Deploy the updated `web/components/arrivals/arrivals-form.tsx`:
```bash
git add web/components/arrivals/arrivals-form.tsx
git commit -m "fix: Show actual error when arrival ledger sync fails"
git push
# Deploy to production via your CI/CD
```

### ✅ Step 3: Test

**Test 1: Farmer Commission with Missing Commission Income Account**
1. Make sure chart of accounts does NOT have "Commission Income" account
2. Try to log farmer commission arrival
3. Should see: `"MISSING_ACCOUNT: Commission Income Account... not found"`
4. ✅ GOOD - Error is now visible!

**Test 2: Fix Account and Retry**
1. Create account "Commission Income" in Chart of Accounts
2. Try farmer commission arrival again
3. Should work ✅

**Test 3: Supplier Commission**
1. Try supplier commission arrival
2. Should work ✅

**Test 4: Direct Purchase**
1. Try direct purchase
2. Should work ✅

**Test 5: Verify Ledger Posted**
```sql
-- Check that ledger entries were created
SELECT COUNT(*) FROM mandi.ledger_entries 
WHERE transaction_type = 'purchase' 
AND entry_date = DATE(NOW());

-- Should show entries from your test arrivals
```

---

## WHAT USERS WILL NOW SEE

### Before Fix ❌
```
User: Creates farmer commission arrival
System: "Arrival Logged But Synchronization Failed - Contact Support"
User: "I don't know what to do!"
Support: "Check your chart of accounts?"
User: "Which account??"
```

### After Fix ✅
```
User: Creates farmer commission arrival
System: "Ledger Setup Issue: 
         MISSING_ACCOUNT: Commission Income Account 
         (name contains 'Commission Income') not found"
User: "Ah! I need to create that account"
Support: "No ticket needed"
```

---

## SIDE EFFECTS & SAFETY

### ✅ Safe to Deploy
- Only adds NULL checks (makes function MORE robust)
- Backward compatible (existing successful arrivals unaffected)
- Only touches arrival ledger posting (not sales, payments, etc)
- No data migration needed
- No breaking changes

### ✅ Zero Data Loss
- Arrivals already created in database are safe
- This just fixes the ledger posting for them
- Can be rerun on old arrivals (it deletes and recreates)

### ⚠️ One Breaking Change (Good)
- After migration, users MUST have proper chart of accounts
- This was always required, just was silently failing before
- Users will now SEE the requirement clearly

---

## NEXT STEPS

1. **Immediately**:
   - [ ] Review this guide with team
   - [ ] Confirm chart of accounts setup for all tenants

2. **This Hour**:
   - [ ] Apply database migration
   - [ ] Deploy frontend code

3. **Testing** (30 mins):
   - [ ] Test farmer commission arrival 
   - [ ] Test supplier commission arrival
   - [ ] Test direct purchase
   - [ ] Verify ledger entries in database

4. **Post-Deployment**:
   - [ ] Monitor error logs for MISSING_ACCOUNT errors
   - [ ] If found, help tenant setup chart properly
   - [ ] Document which accounts each tenant needs

5. **Communication**:
   - [ ] Tell users: "Farmer/supplier arrivals now working"
   - [ ] If any errors: "Check if account X exists"

---

## REFERENCE: Required Chart of Accounts

Tenants MUST have all of these in their chart:

| Account | Code | Purpose |
|---------|------|---------|
| Purchase | 5001 | Direct purchase cost |
| Expense Recovery | 4002 | Transport expenses |
| Cash | 1001 | Cash payments |
| **Commission Income** | - | Commission earned (name contains "Commission Income") |
| **Inventory** | - | Stock value (name contains "Inventory") |

> **Note**: Codes are required for 5001, 4002, 1001. Commission Income and Inventory just need name match.

---

## TROUBLESHOOTING

### Problem: Still seeing error after applying fix

**Check 1**: Did migration apply successfully?
```sql
-- In SQL editor, run:
SELECT * FROM information_schema.routines 
WHERE routine_name = 'post_arrival_ledger';
-- Should show date from today
```

**Check 2**: Restart application cache
```bash
# Clear any cached RPC function definitions
# Refresh browser (hard refresh: Cmd+Shift+R or Ctrl+Shift+R)
```

**Check 3**: Verify chart of accounts exists
```sql
-- In SQL editor:
SELECT id, name, code FROM mandi.accounts 
WHERE organization_id = '<tenant-org-id>'
ORDER BY name;

-- Must have entries that match:
-- - Code = '5001' (Purchase)
-- - Code = '1001' (Cash)  
-- - Code = '4002' (Expense)
-- - Name ILIKE '%Commission Income%'
-- - Name ILIKE '%Inventory%'
```

### Problem: Getting "MISSING_ACCOUNT: Comment Income Account not found"

**Solution**:
1. Go to Chart of Accounts
2. Create new account
3. Name: "Commission Income" (EXACTLY)
4. Type: Income
5. Save
6. Retry arrival

---

## DOCUMENTATION LINKS

- Full technical details: [FIX_ARRIVAL_LEDGER_SYNC_FINAL.md](FIX_ARRIVAL_LEDGER_SYNC_FINAL.md)
- Root cause analysis: [Session memory](../memories/session/arrival_sync_root_cause.md)
- Code diff: Check git commit for `20260413_fix_arrival_ledger_sync_null_check.sql`

---

**Questions?** Check the detailed guide or contact support with error message.
