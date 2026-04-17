# Purchase Transactions & P&L Specification
**Date:** 2026-04-06  
**Topic:** How purchase costs flow into profit/loss calculations

---

## Three Purchase Types

### 1. DIRECT PURCHASE (Non-Farmer, Non-Commission)
Example: Buying apples from a wholesale trader at market price

```
Scenario:
- Supplier: XYZ Traders
- Goods: 100 boxes @ ₹100 = ₹10,000
- Payment Mode: Cash paid immediately
- No commission, no deductions

Transaction Recording:
├─ GOODS TRANSACTION (at entry)
│  ├─ Debit: Inventory (or Purchase) ₹10,000
│  └─ Credit: XYZ Traders ₹10,000
│
└─ PAYMENT TRANSACTION (immediate)
   ├─ Debit: XYZ Traders ₹10,000
   └─ Credit: Cash Account ₹10,000

Purchase Bill: ₹10,000 (bill_amount, paid_amount, status='paid')

P&L Cost: ₹10,000 (What mandi paid to trader)
```

**When sold:**
- Sell Price: ₹15,000
- Cost: ₹10,000
- Gross Profit: ₹5,000

---

### 2. FARMER COMMISSION PURCHASE
Example: Farmer brings apples, mandi charges commission

```
Scenario:
- Farmer: "New Farmer"
- Goods Landed Value: ₹12,000 (at market valuation)
- Mandi Commission: 10% = ₹1,200
- Mandi gives farmer: ₹12,000 - ₹1,200 = ₹10,800
- Payment: Cash to farmer immediately

Transaction Recording:
├─ GOODS TRANSACTION (at entry)
│  ├─ Debit: Inventory ₹12,000 (full market value)
│  ├─ Credit: New Farmer ₹12,000 (full amount owed)
│  ├─ Debit: New Farmer ₹1,200 (commission deduction)
│  └─ Credit: Commission Income ₹1,200 (mandi's income)
│
└─ PAYMENT TRANSACTION
   ├─ Debit: New Farmer ₹10,800 (what we pay)
   └─ Credit: Cash Account ₹10,800

Purchase Bill: ₹12,000 (gross), ₹10,800 (net paid)

P&L Cost: ₹10,800 (What mandi PAID to farmer)
   OR
P&L Cost: ₹12,000 (Full goods value, with commission as separate income)
   ← USER TO CLARIFY WHICH APPROACH
```

**When sold for ₹18,000:**

**Approach A (Cost = Amount Paid):**
- Revenue: ₹18,000
- Cost of Goods: ₹10,800 (paid to farmer)
- Commission Income: ₹1,200 (kept by mandi)
- **Gross Profit: ₹18,000 - ₹10,800 = ₹7,200**
- Commission is separate income: ₹1,200
- **Net Profit: ₹7,200 + ₹1,200 = ₹8,200**

**Approach B (Cost = Full Goods Value):**
- Revenue: ₹18,000
- Cost of Goods: ₹12,000 (full market value)
- Commission Income: ₹1,200 (mandi's cut)
- **Profit: ₹18,000 - ₹12,000 = ₹6,000**
- **After Commission: ₹6,000 + ₹1,200 = ₹7,200**

---

### 3. SUPPLIER COMMISSION PURCHASE
Example: Supplier brings goods on commission basis

```
Scenario:
- Supplier: "Haryana Orchards"
- Goods Value: ₹20,000
- Mandi Commission: 5% = ₹1,000
- Mandi gives supplier: ₹20,000 - ₹1,000 = ₹19,000
- Payment: Bank transfer later

Transaction Recording:
├─ GOODS TRANSACTION (at entry)
│  ├─ Debit: Inventory ₹20,000
│  ├─ Credit: Haryana Orchards ₹20,000
│  ├─ Debit: Haryana Orchards ₹1,000 (commission)
│  └─ Credit: Commission Income ₹1,000
│
└─ PAYMENT TRANSACTION (when cleared via Finance)
   ├─ Debit: Haryana Orchards ₹19,000
   └─ Credit: Bank Account ₹19,000

Purchase Bill: ₹20,000 (gross), ₹19,000 (net payable)

P&L Cost: ₹19,000 (What mandi pays to supplier)
```

---

## Transport & Expenses: Who Bears Them?

### Scenario A: Mandi Bears Transport
```
Farmer brings goods: ₹10,000
Transport from farm: ₹500 (mandi pays)
Mandi Commission: ₹1,000
---
Farmer Receives: ₹10,000 - ₹1,000 = ₹9,000
Mandi Expenses: ₹500 (transport)

P&L:
Cost: ₹9,000 (paid to farmer) + ₹500 (transport mandi paid) = ₹9,500
Commission Income: ₹1,000
```

### Scenario B: Farmer Bears Transport
```
Farmer brings goods: ₹10,000
Transport from farm: ₹500 (farmer already paid)
Mandi Commission: ₹1,000
---
Farmer Receives: ₹10,000 - ₹500 - ₹1,000 = ₹8,500
Mandi Expenses: ₹0

P&L:
Cost: ₹8,500 (what mandi paid)
Commission Income: ₹1,000
Transport: Already paid by farmer (not mandi's cost)
```

---

## Database Schema: What Should Record Where

### mandi.purchase_bills Table

For **Direct Purchase:**
```
bill_id = "PB-001"
lot_id = "LOT-001"
supplier_id = "trader-001"
bill_number = "PB-001-Apple"
gross_amount = 10,000
commission_amount = 0       ← No commission for direct
net_payable = 10,000
payment_status = 'paid'     ← After payment recorded
```

For **Farmer Commission:**
```
bill_id = "PB-002"
lot_id = "LOT-002"
supplier_id = "farmer-001"
bill_number = "PB-002-Apple"
gross_amount = 12,000       ← Full market value
commission_amount = 1,200   ← Mandi's commission
less_amount = 0             ← Any other deductions
net_payable = 10,800        ← What farmer actually gets
payment_status = 'paid'     ← After ₹10,800 paid
```

### Ledger Entries

Should always show:
```
purchase_bills.gross_amount = Total debit to Inventory account
purchase_bills.commission_amount = Credit to Commission Income account
purchase_bills.net_payable = Credit to Supplier/Farmer account
```

---

## P&L Calculation Rules

**CLARIFICATION NEEDED:** Choose your approach

### Option 1: NET COST MODEL (Recommended for Commission)
```
Cost of Goods = Net Amount Paid to Supplier
P&L Profit = Sale Price - Net Amount Paid
Commission = Separate line item (mandi's income)
Expenses = Deducted from profit
```

**Example:**
```
Sale Price: ₹18,000
Less: Cost (paid to farmer): ₹10,800
= Gross Profit: ₹7,200
Plus: Commission Income: ₹1,200
Less: Transport Expenses: ₹500
= Net Profit: ₹7,900
```

### Option 2: FULL VALUE MODEL (More detailed)
```
Cost of Goods = Full Goods Market Value
P&L Profit = Sale Price - Full Market Value
Commission Income = Reduces cost
Expenses = Deducted from profit
```

**Example:**
```
Sale Price: ₹18,000
Less: Cost (full value): ₹12,000
= Gross Profit: ₹6,000
Plus: Commission Income: ₹1,200
Less: Transport Expenses: ₹500
= Net Profit: ₹6,700
```

---

## Current System Status

### ✅ WORKING CORRECTLY:
- Farmer/Supplier commission transactions record as payment
- Purchase bills store gross/net amounts
- Commission income is tracked separately

### ⚠️ VERIFY:
- Direct purchase transactions recording on purchase_bills
- Commission deductions flowing to P&L correctly
- Transport expenses attributed to correct cost center

### ❌ NEEDS CLARIFICATION:
- Which P&L model should be used? (Net vs Full Value)
- How to split costs between mandi and supplier when both bear expenses
- Where to record transport/labor costs in P&L

---

## SQL Changes Needed

### For Purchase Bills P&L:
```sql
-- When calculating P&L, use:
SELECT 
    pb.lot_id,
    pb.gross_amount,           -- Full goods value
    pb.commission_amount,      -- Mandi's income
    pb.net_payable,            -- Cost to mandi (net)
    CASE 
        WHEN commission_model = 'net' THEN pb.net_payable
        WHEN commission_model = 'full' THEN pb.gross_amount
    END as cost_for_pnl,
    (sale_amount - cost_for_pnl) as gross_profit
FROM mandi.purchase_bills pb
JOIN mandi.lots l ON pb.lot_id = l.id
```

### For Commission Income:
```sql
-- Commission should appear in P&L as income, not cost reduction
SELECT 
    commission_amount,  -- Revenue to mandi
    'commission_income' as pnl_category
FROM mandi.purchase_bills
WHERE commission_amount > 0
```

---

## Decision Matrix

| Purchase Type | Bill Amount | Cost to Mandi | P&L Revenue | Notes |
|---|---|---|---|---|
| Direct | ₹10,000 | ₹10,000 | ₹15,000 | Simple: Cost = Paid |
| Farmer Commission | ₹12,000 | ₹10,800 | ₹18,000 | Commission ₹1,200 is income |
| Supplier Commission | ₹20,000 | ₹19,000 | ₹25,000 | Commission ₹1,000 is income |
| With Transport (Mandi) | ₹12,000 | ₹10,800 + ₹500 = ₹11,300 | ₹18,000 | Transport adds to cost |
| With Transport (Farmer) | ₹12,000 | ₹10,800 | ₹18,000 | Transport already deducted |

---

## Questions for User

**Please clarify:**

1. **P&L Model**: Should cost be based on:
   - A) Net amount paid to supplier? OR
   - B) Full goods market value?

2. **Direct Purchase**: Should purchase_bills be populated for:
   - A) All direct purchases? OR
   - B) Only direct purchases with advance payment?

3. **Transport Costs**: When farmer bears transport:
   - A) Is it already deducted from farmer payment? OR
   - B) Is it a separate ledger entry?

4. **Commission Allocation**: Should commission appear as:
   - A) Income line item in P&L? OR
   - B) Cost reduction in COGS?

---

## Implementation Timeline

Once clarified, changes needed:

1. **SQL Function**: Update P&L calculation query
2. **Dashboard**: Update P&L report to show correct cost
3. **Purchase Bills**: Ensure correct amount_paid values
4. **Ledger**: Verify double-entry consistency

---

## Sign-Off Required

These decisions affect:
- ✅ Profit reporting
- ✅ Cost analysis
- ✅ Performance metrics
- ✅ Tax calculations

**Awaiting your clarification on the 4 questions above.**
