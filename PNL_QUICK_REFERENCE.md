# P&L Quick Reference Card

**Print This Card for Reference**

---

## The Formula

```
┌─────────────────────────────────────────────────┐
│  PROFIT = Revenue - Cost - Expenses + Commission│
└─────────────────────────────────────────────────┘
```

---

## Component Mapping

| Component | Source Table | Column | Notes |
|-----------|--------------|--------|-------|
| **Revenue** | sales | total_amount | What buyer paid |
| **Cost** | purchase_bills | net_payable | What mandi paid (already includes all deductions like less_percent & cut) |
| **Expenses** | lots | expense_paid_by_mandi | Transport, labor, packing paid by mandi |
| **Commission** | purchase_bills | commission_amount | Amount mandi kept (income, not cost) |

---

## Three Purchase Types

### 1️⃣ DIRECT PURCHASE
```
Bill: ₹10,000
Paid: ₹10,000 ← COST
Commission: ₹0
```

### 2️⃣ FARMER COMMISSION  
```
Bill: ₹12,000
Commission (10%): ₹1,200 ← INCOME
Paid: ₹10,800 ← COST
```

### 3️⃣ SUPPLIER COMMISSION
```
Bill: ₹20,000
Commission (5%): ₹1,000 ← INCOME
Paid: ₹19,000 ← COST
```

---

## Test Case: Farmer Commission

```
ARRIVAL:
├─ Bill Amount: ₹12,000
├─ Commission (10%): ₹1,200
├─ Paid to Farmer: ₹10,800
└─ Expenses: ₹500

SALE:
└─ Sell Price: ₹18,000

P&L CALCULATION:
├─ Revenue: ₹18,000
├─ Less Cost: -₹10,800 (paid to farmer)
├─ Less Expenses: -₹500 (borne by mandi)
├─ Plus Commission: +₹1,200 (mandi's income)
└─ = NET PROFIT: ₹7,900 ✅

MARGIN: 43.9% (₹7,900 ÷ ₹18,000)
```

---

## Database Columns

### mandi.purchase_bills
- `gross_amount` - Full goods value
- `commission_amount` - Mandi's cut (NEW)
- `net_payable` - Paid to farmer/supplier

### mandi.lots  
- `supplier_rate` - Rate per unit
- `initial_qty` - Quantity received
- `expense_paid_by_mandi` - Expenses borne (NEW)

### mandi.sale_items
- `amount` - Revenue from sale
- `qty` - Quantity sold
- `lot_id` - Link to lot purchased

---

## P&L Report (/reports/pl)

**Shows:**
- Net Profit (summary card)
- Margin % (efficiency score)
- Breakdown (Revenue, Cost, Expenses, Commission)
- Transaction table (each lot's P&L)
- Export as CSV

**Filters:**
- Date range (Today, Last Month, This Year, etc.)
- Custom date picker

---

## Common Scenarios

### Scenario A: Expenses NOT collected at sale
```
Sale Price: ₹17,500 (doesn't include ₹500 expense)
Cost: ₹10,800
Expenses: ₹500
Commission: ₹1,200

PROFIT = 17,500 - 10,800 - 500 + 1,200 = 6,400
(Mandi bears the ₹500 expense)
```

### Scenario B: Expenses collected at sale
```
Sale Price: ₹18,000 (includes ₹500 expense)
Cost: ₹10,800
Expenses: ₹500 (recouped from buyer)
Commission: ₹1,200

PROFIT = 18,000 - 10,800 - 500 + 1,200 = 7,900
(Mandi recoups the ₹500 expense)
```

---

## Key Points to Remember

✅ **Cost = Net Amount Paid**
- NOT full goods value
- AFTER commission deduction
- Direct payment to farmer/supplier

✅ **Expenses = Money Mandi Paid**
- Transport, labor, packing
- Can be collected back at sale
- Optional (can be 0 or blank)

✅ **Commission = Mandi's Income**
- Kept by mandi, not a cost
- Added to profit
- Shows separately in breakdown

✅ **Margin = Profit ÷ Revenue**
- Shows efficiency/profitability
- Higher % = better performance
- Can be negative if expenses high

---

## Accessing the Data

### Via SQL
```sql
-- See all lots' P&L
SELECT * FROM mandi.v_lot_pnl_breakdown;

-- Organization summary
SELECT * FROM mandi.v_organization_pnl_summary;

-- By supplier
SELECT * FROM mandi.v_pnl_by_supplier;

-- By commodity
SELECT * FROM mandi.v_pnl_by_commodity;
```

### Via Dashboard
```
URL: /reports/pl
→ Select date range
→ View metrics and breakdown
→ Download CSV
→ Share via WhatsApp
```

---

## Troubleshooting

**Q: Numbers don't look right?**
A: Verify:
- expense_paid_by_mandi is recorded
- commission_amount is populated
- Sale is linked to lot via sale_items

**Q: Commission shows as 0?**
A: Check:
- Direct purchase = no commission (expected)
- Commission purchase = check commission_amount in DB

**Q: Export doesn't include expenses?**
A: Verify:
- Expenses column in CSV header
- Check lots table has expense_paid_by_mandi value

---

## Implementation Timeline

| Step | Status | Time |
|------|--------|------|
| Schema migration | ✅ Done | - |
| Views creation | ✅ Done | - |
| Frontend update | ✅ Done | - |
| Deployment | ⏳ Pending | ~5 min |
| Testing | ⏳ Pending | ~10 min |

---

## Document Hierarchy

1. **PNL_QUICK_REFERENCE.md** ← You are here
2. PNL_CALCULATION_MODEL.md - Full formula specification
3. PNL_IMPLEMENTATION_COMPLETE.md - Implementation details
4. DEPLOYMENT_GUIDE.md - How to deploy
5. README_PNL_IMPLEMENTATION.md - Summary & how-to

---

**Last Updated:** 2026-04-06  
**Status:** ✅ Ready for Production

