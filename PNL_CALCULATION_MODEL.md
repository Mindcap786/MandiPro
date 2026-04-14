# P&L Calculation Model - FINAL SPEC
**Status:** APPROVED & BINDING  
**Date:** 2026-04-06

---

## Core Formula

```
PROFIT = Sale Price - Cost - Expenses + Commission
        
Where:
- Cost = Amount PAID to farmer/supplier (net)
- Expenses = Costs mandi pays on behalf (to be collected at sale)
- Commission = Amount kept by mandi
```

---

## Example: Farmer Commission Purchase

### At Purchase:
```
Farmer brings goods valued: ₹12,000
Mandi Commission: 10% = ₹1,200
Amount PAID to farmer: ₹10,800 ← THIS IS COST

Mandi pays (on behalf):
├─ Transport: ₹300
├─ Labor: ₹150
├─ Packing: ₹50
└─ Total Expenses: ₹500
```

### At Sale:
```
Goods sold for: ₹18,000

P&L Calculation:
├─ Revenue: ₹18,000
├─ Less: Cost (paid to farmer): -₹10,800
├─ Less: Expenses (mandi paid): -₹500
├─ Gross Profit: ₹6,700
├─ Plus: Commission (kept by mandi): +₹1,200
└─ NET PROFIT: ₹7,900 ✓
```

---

## Three Purchase Types with P&L

### 1. DIRECT PURCHASE (Trader)

```
Purchase:
├─ Trader: "ABC Traders"
├─ Goods Value: ₹10,000
├─ No Commission: ₹0
├─ Amount Paid: ₹10,000
└─ Mandi Expenses: ₹200

COST = ₹10,000
EXPENSES = ₹200

Sale at ₹15,000:
├─ Revenue: ₹15,000
├─ Less Cost: -₹10,000
├─ Less Expenses: -₹200
├─ Plus Commission: +₹0
└─ Profit: ₹4,800 ✓
```

---

### 2. FARMER COMMISSION PURCHASE

```
Purchase:
├─ Farmer: "New Farmer"
├─ Goods Value: ₹12,000
├─ Commission (10%): ₹1,200 ← Kept by mandi
├─ Amount Paid to Farmer: ₹10,800 ← COST
├─ Mandi Expenses:
│  ├─ Transport: ₹300
│  ├─ Labor: ₹150
│  ├─ Packing: ₹50
│  └─ Total: ₹500
└─ Status: Payment recorded

COST = ₹10,800
EXPENSES = ₹500
COMMISSION = ₹1,200

Sale at ₹18,000:
├─ Revenue: ₹18,000
├─ Less Cost: -₹10,800
├─ Less Expenses: -₹500
├─ Plus Commission: +₹1,200
└─ Profit: ₹7,900 ✓

Profit Breakdown:
├─ From Sale Margin: ₹18,000 - ₹10,800 = ₹7,200
├─ Less Expenses Paid: ₹500
├─ Plus Commission Earned: ₹1,200
└─ Total: ₹7,900
```

---

### 3. SUPPLIER COMMISSION PURCHASE

```
Purchase:
├─ Supplier: "Haryana Orchards"
├─ Goods Value: ₹20,000
├─ Commission (5%): ₹1,000 ← Kept by mandi
├─ Amount Paid to Supplier: ₹19,000 ← COST
├─ Mandi Expenses:
│  ├─ Transport: ₹400
│  ├─ Hamali: ₹200
│  └─ Total: ₹600
└─ Status: Payment recorded

COST = ₹19,000
EXPENSES = ₹600
COMMISSION = ₹1,000

Sale at ₹26,000:
├─ Revenue: ₹26,000
├─ Less Cost: -₹19,000
├─ Less Expenses: -₹600
├─ Plus Commission: +₹1,000
└─ Profit: ₹6,400 ✓
```

---

## Ledger Entry Mapping

### Purchase Recording:

```
GOODS ENTRY:
├─ Debit Inventory: ₹12,000 (full goods value)
├─ Credit Farmer: ₹12,000 (full liability)
│
├─ Debit Farmer: ₹1,200 (commission deduction)
└─ Credit Commission Income: ₹1,200 (mandi's income)

PAYMENT ENTRY (when recorded):
├─ Debit Farmer: ₹10,800 (what we pay)
└─ Credit Cash/Bank: ₹10,800 (settlement)

EXPENSES ENTRY (when paid):
├─ Debit Transport Expense: ₹300
├─ Debit Labor Expense: ₹150
├─ Debit Packing Expense: ₹50
└─ Credit Cash/Bank: ₹500
```

### Sale Recording:

```
SALE ENTRY:
├─ Debit Cash/Bank: ₹18,000
└─ Credit Sales Revenue: ₹18,000

COGS (Cost of Goods Sold):
├─ Debit COGS: ₹10,800 (what we paid farmer)
└─ Credit Inventory: ₹10,800

EXPENSES ALLOCATION:
├─ Debit COGS: ₹500 (expenses for this lot)
└─ Credit Expense Payable: ₹500
```

---

## Database Requirements

### mandi.purchase_bills (Must include):

```
For Farmer Commission Purchase:
├─ lot_id: "LOT-001"
├─ supplier_id: "farmer-001"
├─ bill_number: "PB-001-Apple"
├─ bill_date: 2026-04-06
├─ gross_amount: 12,000 ← Full goods value
├─ commission_amount: 1,200 ← Mandi keeps this
├─ less_amount: 0
├─ net_payable: 10,800 ← Amount paid to farmer (COST)
├─ paid_amount: 10,800
├─ payment_status: 'paid'
└─ created_at: 2026-04-06

Note: gross_amount - commission_amount = net_payable
      net_payable = actual cost to mandi
```

### mandi.lots (Must include):

```
For cost tracking:
├─ lot_id: "LOT-001"
├─ supplier_rate: 120 ← Rate per unit
├─ initial_qty: 100 ← Quantity
├─ commission_percent: 10 ← Commission %
├─ advance: 10,800 ← Paid to farmer (COST)
├─ advance_payment_mode: 'cash'
└─ expense_paid_by_mandi: 500 ← Expenses mandi paid

Calculations:
├─ Inventory Value = initial_qty * supplier_rate = 100 * 120 = 12,000
├─ Commission = Inventory Value * commission_percent = 12,000 * 10% = 1,200
├─ Cost to Mandi = Inventory Value - Commission = 10,800 ✓
└─ Total Cost (with expenses) = 10,800 + 500 = 11,300
```

---

## P&L Report Line Items

### For Each Lot Sold:

```
Revenue:
├─ Sale Price: ₹18,000

Cost of Goods:
├─ Less: Amount paid to farmer: -₹10,800
├─ Less: Expenses mandi paid: -₹500
├─ Equals: Gross Profit: ₹6,700

Other Income:
├─ Plus: Commission earned: +₹1,200
├─ Equals: NET PROFIT: ₹7,900 ✓
```

### Full P&L Format:

```
SALES REVENUE: ₹18,000

COST OF GOODS SOLD:
├─ Direct Cost (paid to farmers): ₹10,800
├─ Expenses Paid on Behalf: ₹500
└─ Total COGS: ₹11,300

GROSS PROFIT: ₹6,700 (₹18,000 - ₹11,300)

OTHER INCOME:
├─ Commission: ₹1,200
└─ Total Other Income: ₹1,200

NET PROFIT: ₹7,900 ✓ (₹6,700 + ₹1,200)
```

---

## SQL Formulas for P&L

### Cost Calculation:
```sql
-- COST = Amount Paid to Farmer/Supplier
SELECT 
    pb.net_payable as cost_to_mandi,  -- What we paid
    COALESCE(l.expense_paid_by_mandi, 0) as expenses_mandi_paid,
    (pb.net_payable + COALESCE(l.expense_paid_by_mandi, 0)) as total_cost
FROM mandi.purchase_bills pb
JOIN mandi.lots l ON pb.lot_id = l.id;
```

### Commission Calculation:
```sql
-- COMMISSION = Amount Mandi Kept (not Cost)
SELECT 
    pb.commission_amount as commission_earned,  -- Mandi's income
    'commission_income' as pnl_line
FROM mandi.purchase_bills pb
WHERE pb.commission_amount > 0;
```

### Profit Calculation:
```sql
-- PROFIT = Sale Price - Cost - Expenses + Commission
SELECT 
    s.id as sale_id,
    s.total_amount as revenue,
    pb.net_payable as cost,
    COALESCE(l.expense_paid_by_mandi, 0) as expenses,
    pb.commission_amount as commission,
    (s.total_amount - pb.net_payable - COALESCE(l.expense_paid_by_mandi, 0) + pb.commission_amount) as profit
FROM mandi.sales s
JOIN mandi.sale_items si ON s.id = si.sale_id
JOIN mandi.lots l ON si.lot_id = l.id
JOIN mandi.purchase_bills pb ON l.id = pb.lot_id;
```

---

## Transaction Flow

### At Purchase:
```
1. Goods entered: Inventory ₹12,000, Farmer ₹12,000
2. Commission recorded: Farmer -₹1,200, Commission Income +₹1,200
3. Payment made: Farmer -₹10,800, Cash -₹10,800
4. Expenses recorded: Transport -₹300, Cash -₹300 (and others)

Result: Farmer owes ₹0, Commission earned ₹1,200, Expenses paid ₹500
```

### At Sale:
```
1. Sale recorded: Cash +₹18,000, Sales Revenue +₹18,000
2. COGS recorded: COGS +₹10,800, Inventory -₹10,800
3. Expenses allocated: COGS +₹500, Expense Payable +₹500

Result: Profit = ₹18,000 - ₹10,800 - ₹500 + ₹1,200 = ₹7,900
```

---

## Implementation Checklist

### ✅ Already Working:
- [ ] Commission deducted from farmer payment
- [ ] Amount paid recorded in purchase_bills.net_payable
- [ ] Commission tracked separately

### 🔨 To Implement:
- [ ] Capture mandi expenses (transport, labor, packing) per lot
- [ ] Add expense_paid_by_mandi column to mandi.lots
- [ ] Update P&L query to use formula: Revenue - Cost - Expenses + Commission
- [ ] Create P&L report showing all line items
- [ ] Validate: Profit = ₹18,000 - ₹10,800 - ₹500 + ₹1,200 = ₹7,900

### 📊 To Report:
- [ ] P&L by lot
- [ ] P&L by farmer/supplier
- [ ] P&L by date range
- [ ] Commission earned (separate line)
- [ ] Expenses by type (transport, labor, etc.)

---

## Edge Cases

### Case 1: Expenses Collected at Sale
```
Farmer gets: ₹10,800
Expenses mandi paid: ₹500
At sale, buyer pays: ₹18,000 (includes ₹500 for expenses)

P&L:
├─ Revenue: ₹18,000
├─ Less Cost: ₹10,800
├─ Less Expenses: ₹500 (already paid, now recouped)
├─ Plus Commission: ₹1,200
└─ Profit: ₹7,900 ✓ (Mandi recoups expenses)
```

### Case 2: Expenses NOT Collected
```
Farmer gets: ₹10,800
Expenses mandi paid: ₹500
At sale, buyer pays: ₹17,500 (doesn't include expense)

P&L:
├─ Revenue: ₹17,500
├─ Less Cost: ₹10,800
├─ Less Expenses: ₹500 (mandi bears this)
├─ Plus Commission: ₹1,200
└─ Profit: ₹6,400 (Mandi loses ₹500)
```

---

## Sign-Off

**This is the EXACT P&L model you want:**

✅ Cost = Amount paid to farmer/supplier (NET)  
✅ Expenses = Costs mandi pays on behalf (deducted from profit)  
✅ Commission = Amount kept by mandi (added to profit)  
✅ Profit = Sale - Cost - Expenses + Commission  

**Ready to implement.** 🎯
