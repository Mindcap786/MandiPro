# P&L Implementation - Deploy Now

**Status:** Ready to deploy  
**Time Required:** ~30 minutes

---

## Step 1: Deploy SQL Migrations to Supabase

Go to Supabase Dashboard → SQL Editor and execute these 4 migrations in order:

### Migration 1 (if not already done)
```sql
-- File: supabase/migrations/20260406120000_strict_no_duplicate_transactions.sql
-- Copy entire contents and paste into Supabase SQL Editor
-- Run it
```

### Migration 2 (if not already done)
```sql
-- File: supabase/migrations/20260406110000_cleanup_duplicate_arrivals_ledger.sql
-- Copy entire contents and paste into Supabase SQL Editor
-- Run it
```

### Migration 3 (NEW - MUST RUN)
```sql
-- File: supabase/migrations/20260406130000_add_expense_tracking_to_lots.sql
-- This adds expense_paid_by_mandi column
-- COPY & RUN THIS
```

### Migration 4 (NEW - MUST RUN)
```sql
-- File: supabase/migrations/20260406140000_pnl_validation_queries.sql
-- This creates P&L views
-- COPY & RUN THIS
```

---

## Step 2: Deploy Frontend

```bash
# In terminal at project root:
git push origin main

# Or if you want to test locally first:
npm run dev
# Navigate to http://localhost:3000/reports/pl
```

---

## Step 3: Verify Deployment

1. **Check Supabase** - Run this query:
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'lots' AND column_name = 'expense_paid_by_mandi';
-- Should return 1 row if migration worked
```

2. **Check Frontend** - Navigate to:
```
http://localhost:3000/reports/pl
```
- Should see "Trading PnL" header
- Should see Revenue, Cost, Expenses, Commission columns
- No errors in console

---

## If Any Migration Fails

Check the error message and:
1. Ensure tables exist (lots, purchase_bills, sale_items)
2. Verify no duplicate column names
3. Check Supabase logs for details

---

## Done?

Once deployed, the system will:
✅ Calculate: PROFIT = Revenue - Cost - Expenses + Commission
✅ Track expenses per lot
✅ Show commission as separate income line
✅ Generate accurate P&L reports

---

**After deployment is successful, we'll fix the subscription error.**
