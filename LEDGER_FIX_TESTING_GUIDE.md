# LEDGER FIX - QUICK TESTING GUIDE

## ✅ Phase 1: Verify Balance Calculations

### Test Case: Hizan (Supplier)
```sql
-- Should show: closing_balance = 20000 (after 30000 bill - 10000 payment)
SELECT mandi.get_ledger_statement('41d7df13-1d5e-467a-92e8-5b120d462a3d'::uuid);
```

**Expected Result**:
```json
{
  "closing_balance": 20000,
  "contact_type": "supplier",
  "transactions": [
    {"description": "Payment - CASH #001", "debit": 10000, "balance": -10000},
    {"description": "Purchase Bill ##193", "credit": 30000, "balance": 20000}
  ]
}
```

### Check Supplier Balances (Old Formula vs New)
```sql
-- OLD FORMULA (WRONG): -30000 + 10000 = -20000 ❌
-- NEW FORMULA (CORRECT): 30000 - 10000 = 20000 ✅

SELECT 
    c.name,
    c.type,
    COALESCE(SUM(le.credit), 0) as total_credit,
    COALESCE(SUM(le.debit), 0) as total_debit,
    -- Correct formula for supplier
    COALESCE(SUM(le.credit), 0) - COALESCE(SUM(le.debit), 0) as correct_balance
FROM mandi.contacts c
LEFT JOIN mandi.ledger_entries le ON c.id = le.contact_id
WHERE c.type = 'supplier'
GROUP BY c.id, c.name, c.type
ORDER BY correct_balance DESC
LIMIT 10;
```

### Check Buyer/Customer Balances
```sql
SELECT 
    c.name,
    c.type,
    COALESCE(SUM(le.debit), 0) as total_debit,
    COALESCE(SUM(le.credit), 0) as total_credit,
    -- Correct formula for buyer/customer
    COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0) as they_owe_us
FROM mandi.contacts c
LEFT JOIN mandi.ledger_entries le ON c.id = le.contact_id
WHERE c.type IN ('buyer', 'customer')
GROUP BY c.id, c.name, c.type
HAVING COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0) != 0
ORDER BY they_owe_us DESC;
```

---

## ✅ Phase 2: Verify Automatic Payment Posting

### Test Creating a New Receipt (Payment from Supplier)
```sql
-- Insert a payment receipt
INSERT INTO mandi.receipts (
    id, organization_id, contact_id, amount, payment_mode, 
    receipt_date, reference_no, narration
) VALUES (
    gen_random_uuid(),
    '76c6d2ad-a3e0-4b41-a736-ff4b7ca14da8'::uuid,  -- Hizan's org
    '41d7df13-1d5e-467a-92e8-5b120d462a3d'::uuid,  -- Hizan
    5000,  -- Another payment
    'CASH',
    CURRENT_DATE,
    'PAY-001',
    'Test Payment'
) ON CONFLICT DO NOTHING;

-- Verify ledger entry was automatically created
SELECT * FROM mandi.ledger_entries 
WHERE transaction_type = 'payment_receipt'
  AND contact_id = '41d7df13-1d5e-467a-92e8-5b120d462a3d'
ORDER BY created_at DESC
LIMIT 2;
```

**Expected**: New DEBIT entry for ₹5,000 should appear in ledger_entries

### Test Hizan Balance After New Payment
```sql
-- Should now show: 20000 + 5000 = 25000 paid, balance = 30000 - 15000 = 15000
SELECT mandi.get_ledger_statement('41d7df13-1d5e-467a-92e8-5b120d462a3d'::uuid);
```

---

## ✅ Phase 3: Check UI Integration

### In Finance → Ledger Page

1. **Suppliers List**
   - All suppliers should show correct outstanding balances
   - Hizan should show ₹20,000 (not ₹30,000)
   - No supplier should show ₹0 if they have bills

2. **Ledger Statement View**
   - Should display all transactions in date order
   - Running balance should update correctly per line
   - Final balance should match closing_balance from API

3. **Payment Modes Test**
   - Select different suppliers/buyers
   - Filter by date range
   - Verify balances update correctly

---

## 🔍 Debugging Commands

### If Ledger Empty Despite Having Entries
```sql
-- Check ledger_entries table directly
SELECT COUNT(*) FROM mandi.ledger_entries
WHERE contact_id = '41d7df13-1d5e-467a-92e8-5b120d462a3d';

-- Check organization matches
SELECT DISTINCT organization_id FROM mandi.ledger_entries
WHERE contact_id = '41d7df13-1d5e-467a-92e8-5b120d462a3d';

-- Check entry status
SELECT DISTINCT status FROM mandi.ledger_entries
WHERE contact_id = '41d7df13-1d5e-467a-92e8-5b120d462a3d';
```

### If Balances Still Wrong
```sql
-- Verify contact type is correct
SELECT id, name, type FROM mandi.contacts WHERE name = 'Hizan';

-- Run manual calculation
SELECT 
    c.name,
    c.type,
    SUM(le.credit) as total_credit,
    SUM(le.debit) as total_debit,
    CASE 
        WHEN c.type = 'supplier' THEN SUM(le.credit) - SUM(le.debit)
        ELSE SUM(le.debit) - SUM(le.credit)
    END as correct_balance
FROM mandi.contacts c
LEFT JOIN mandi.ledger_entries le ON c.id = le.contact_id
WHERE c.name = 'Hizan'
GROUP BY c.id, c.name, c.type;
```

### If Trigger Not Working (No Auto-Posting)
```sql
-- Check trigger exists
SELECT * FROM information_schema.triggers 
WHERE trigger_name IN ('trg_post_receipt_ledger', 'trg_post_voucher_ledger');

-- Check function exists
SELECT * FROM pg_proc 
WHERE proname IN ('post_receipt_ledger_entry', 'post_voucher_ledger_entry');

-- Manually test function
SELECT mandi.post_receipt_ledger_entry();
```

---

## 📊 Before/After Comparison

### BEFORE FIX
| Contact | Type | Debit | Credit | Balance | Correct? |
|---------|------|-------|--------|---------|----------|
| Hizan | Supplier | 0 | 30000 | -30000 | ❌ |
| Customer X | Buyer | 0 | 0 | 0 | ❌ |
| Payment Received | - | 0 | 0 | No entry | ❌ |

### AFTER FIX
| Contact | Type | Debit | Credit | Balance | Correct? |
|---------|------|-------|--------|---------|----------|
| Hizan | Supplier | 10000 | 30000 | 20000 | ✅ |
| Customer X | Buyer | Sale Amt | Paid Amt | Correct | ✅ |
| Payment Received | - | 0 | Amount | Posted Auto | ✅ |

---

## 🎯 Sign-Off Checklist

- [ ] Hizan balance shows ₹20,000 (not ₹30,000)
- [ ] All supplier balances are positive (money owed)
- [ ] All buyer balances calculated as debit - credit
- [ ] Ledger statement transactions visible
- [ ] Running balances show progression
- [ ] New payments auto-post to ledger
- [ ] New vouchers auto-post to ledger
- [ ] No duplicate entries created
- [ ] Date filtering works correctly
- [ ] Organization context handled properly

---

## 📞 Rollback Instructions (If Needed)

If issues arise, rollback to previous version:

```sql
-- Drop the fixed function
DROP FUNCTION IF EXISTS mandi.get_ledger_statement CASCADE;

-- Drop new triggers
DROP TRIGGER IF EXISTS trg_post_receipt_ledger ON mandi.receipts;
DROP TRIGGER IF EXISTS trg_post_voucher_ledger ON mandi.vouchers;

-- Drop posting functions
DROP FUNCTION IF EXISTS mandi.post_receipt_ledger_entry CASCADE;
DROP FUNCTION IF EXISTS mandi.post_voucher_ledger_entry CASCADE;
```

---

**Last Updated**: April 12, 2026  
**Test Date**: [To be filled after testing]  
**Tested By**: [To be filled after testing]  
**Status**: Ready for QA Testing