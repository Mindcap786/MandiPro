# DEPLOYMENT GUIDE - Payment System Fixes
## Apply immediately to fix production issues

### Step 1: Backup Database
```bash
# Create backup before applying migrations
supabase db push --dry-run
```

### Step 2: Apply Migrations (in order)
```bash
# Migration 1: Fix cash payment status bug and standardize ledger entries
supabase db push supabase/migrations/20260412180000_fix_cash_payment_status_bug.sql

# Migration 2: Add duplicate prevention and ledger status consistency
supabase db push supabase/migrations/20260412190000_fix_ledger_duplicate_and_status.sql
```

### Step 3: Deploy Frontend Changes
```bash
# The day-book.tsx changes will automatically take effect
npm run build
npm run deploy
```

### Step 4: Verify the Fixes

**Test Cash Payment:**
1. Go to Sales → New Invoice
2. Select a lot and add a buyer
3. Change payment mode to "Cash"
4. Submit and check the bill number
5. **Expected Result**: The invoice status should show "PAID" immediately

**Test UPI Payment:**
1. Repeat above but select "UPI/BANK"
2. **Expected Result**: Status should be "PAID"

**Test Partial Payment:**
1. Create an invoice for ₹1000
2. Select cash but manually set `amount_received = 500`
3. Submit
4. **Expected Result**: Status should be "PARTIAL"

**Test Credit/Udhaar:**
1. Payment mode = "Credit"
2. **Expected Result**: Status should be "PENDING"

**Check Day Book:**
1. Go to Finance → Day Book
2. Filter by today's date
3. **Expected**: All sale entries should appear correctly with proper categorization

### Step 5: Monitor Logs
```bash
# Check for any RPC errors
tail -f logs/supabase.log | grep confirm_sale_transaction
```

---

## Rollback Plan (if needed)

If issues occur, you can rollback:
```bash
# Rollback migrations (in reverse order)
supabase migration list
supabase db reset

# Then reapply only the first migration if needed
```

---

## Known Limitations After Fix

1. **Credit sales**: Still don't create receipt voucher until payment is manually recorded
   - This is intentional per requirements
   - Will be added in future "Mark Payment" feature

2. **Pending cheques**: Change to paid status only after manual cheque clearing
   - Requires separate RPC: `clear_cheque(cheque_id)`

---

## Support

If you encounter issues:
1. Check FIX_PAYMENT_SYSTEM_COMPREHENSIVE.md for detailed technical explanation
2. Review migration files for SQL changes
3. Check browser console for any frontend errors
4. Review Supabase logs for RPC errors
