# PURCHASE BILL CALCULATIONS - QUICK COMPARISON
**Farmer Commission vs Supplier Commission vs Direct | Side-by-Side**

---

## 🔀 THE THREE TYPES: SIDE-BY-SIDE

### TYPE 1️⃣ DIRECT PURCHASE

```
👤 Buyer: Us
📦 Source: Direct Supplier (not consignment)
💰 Commission: NONE
📊 What We Pay: Just the goods (minus damage)

FORMULA:
┌────────────────────────────────────────┐
│ Bill = Adjusted_Qty × Rate - Expenses  │
│     - Advance                          │
└────────────────────────────────────────┘

EXAMPLE with 10% Less:
  Initial: 100 Box
  Less: 10% (10 damaged)
  Good Qty: 90 Box ✓
  Rate: ₹1,000/Box
  ─────────────────────
  Bill = 90 × ₹1,000 = ₹90,000 ✓
  (No commission deducted)

BALANCE after ₹20,000 CASH Advance:
  ₹90,000 - ₹20,000 = ₹70,000 ⚠️ PARTIAL
```

---

### TYPE 2️⃣ FARMER COMMISSION (Consignment from Farmer)

```
👤 Buyer: Farmer (consignment agent)
📦 Source: Farmer (goods on consignment)
💰 Commission WE take: 10-15% typical
💸 Farmer gets: Goods value - Commission
📊 What Farmer Gets: Reduced by our commission

FORMULA:
┌──────────────────────────────────────────────┐
│ Effective_Value = MAX(Sales, Base)           │
│ Bill = Effective_Value                       │
│      × (100 - Commission%) / 100             │
│      - Farmer_Charges                        │
│      - Expenses                              │
│      - Advance                               │
└──────────────────────────────────────────────┘

EXAMPLE with 10% Commission + 5% Loss:
  Initial: 100 kg
  Less: 5% (lost in transport)
  Good Qty: 95 kg
  Rate: ₹100/kg
  Base Value: 95 × ₹100 = ₹9,500
  Commission: 10%
  ─────────────────────────────
  
  Step 1: Effective Value
          = Sold at ₹9,500 (from sales record)
  
  Step 2: Our Commission Earned
          = ₹9,500 × 10% = ₹950 💰 (WE GET THIS)
  
  Step 3: Farmer Gets
          = ₹9,500 - ₹950 = ₹8,550
  
  Step 4: Minus Charges & Expenses
          = ₹8,550 - ₹200 (charges) - ₹100 (expenses)
          = ₹8,250
  
  Final Bill to FARMER: ₹8,250

BALANCE after ₹2,000 CASH Advance:
  ₹8,250 - ₹2,000 = ₹6,250 ⚠️ PARTIAL
  
  👨‍🌾 FARMER INSIGHT:
  Original goods: ₹9,500
  Lost to damage: ₹500 (5%)
  Lost to our commission: ₹950 (10%)
  Lost to charges/expenses: ₹300
  Total received: ₹8,250 (87% of original)
```

---

### TYPE 3️⃣ SUPPLIER COMMISSION (From Supplier Partner)

```
👤 Buyer: Supplier (business partner)
📦 Source: Supplier (commission arrangement)
💰 Commission SUPPLIER bears: 5-10% typical
💸 Supplier gets: Goods value - Commission
📊 What Supplier Gets: Reduced by commission

FORMULA: ⚠️ IDENTICAL TO FARMER
┌──────────────────────────────────────────────┐
│ Bill = Effective_Value                       │
│      × (100 - Commission%) / 100             │
│      - Supplier_Charges                      │
│      - Expenses                              │
│      - Advance                               │
└──────────────────────────────────────────────┘

EXAMPLE with 8% Commission + 2% Loss:
  Initial: 50 Box
  Less: 2% (1 box damaged)
  Good Qty: 49 Box
  Rate: ₹2,000/Box
  Base Value: 49 × ₹2,000 = ₹98,000
  Commission: 8%
  ─────────────────────────────
  
  Step 1: Effective Value
          = Sold at ₹101,000 (market rate higher)
  
  Step 2: Our Commission Earned
          = ₹101,000 × 8% = ₹8,080 💰 (WE GET THIS)
  
  Step 3: Supplier Gets
          = ₹101,000 - ₹8,080 = ₹92,920
  
  Step 4: Minus Charges & Expenses
          = ₹92,920 - ₹500 - ₹150
          = ₹92,270
  
  Final Bill to SUPPLIER: ₹92,270

BALANCE after ₹30,000 UPI Advance:
  ₹92,270 - ₹30,000 = ₹62,270 ⚠️ PARTIAL
  
  🏢 SUPPLIER INSIGHT:
  Original goods: ₹101,000
  Lost to damage: ₹2,000 (2%)
  Lost to our commission: ₹8,080 (8%)
  Lost to charges/expenses: ₹650
  Total received: ₹92,270 (91% of original)
```

---

## 📊 COMPARISON TABLE

| Aspect | Direct | Farmer Commission | Supplier Commission |
|---|---|---|---|
| **Commission Taken** | ❌ None | ✓ 10-15% | ✓ 5-10% |
| **Who Loses Commission** | N/A | 👨‍🌾 Farmer | 🏢 Supplier |
| **Who Gets Commission** | N/A | 💰 Us | 💰 Us |
| **Less% Effect** | Reduces qty only | Reduces qty + commission base | Reduces qty + commission base |
| **Typical Bill** | ₹100k on ₹100k goods | ₹85-90k on ₹100k goods | ₹90-95k on ₹100k goods |
| **Formula Complexity** | Simple | Complex | Complex (same as farmer) |
| **Code Path** | `if (arrivalType === "direct")` | `else` (commission path) | `else` (commission path) |

---

## 🧮 THE LESS% EFFECT

### Without Loss (0% Less)
```
DIRECT:
  100 × ₹100 = ₹10,000

FARMER COMMISSION (10%):
  ₹10,000 × 90% = ₹9,000

SUPPLIER COMMISSION (8%):
  ₹10,000 × 92% = ₹9,200
```

### With 5% Loss
```
DIRECT:
  95 × ₹100 = ₹9,500 (lost ₹500)

FARMER COMMISSION (10%):
  ₹9,500 × 90% = ₹8,550 (lost ₹500 + ₹450 commission effect)

SUPPLIER COMMISSION (8%):
  ₹9,500 × 92% = ₹8,740 (lost ₹500 + ₹260 commission effect)
```

### With 10% Loss (Major Damage)
```
DIRECT:
  90 × ₹100 = ₹9,000 (lost ₹1,000)

FARMER COMMISSION (10%):
  ₹9,000 × 90% = ₹8,100 (lost ₹1,000 + ₹900 commission effect)
  
  Farmer's perspective:
  ┌──────────────────────────────────┐
  │ Original goods value: ₹10,000    │
  │ Damage loss: -₹1,000 (10%)       │
  │ Commission loss: -₹900 (9%)      │
  │ They receive: ₹8,100             │
  │ Total loss: 19% 😞               │
  └──────────────────────────────────┘

SUPPLIER COMMISSION (8%):
  ₹9,000 × 92% = ₹8,280
```

**KEY**: In commission types, the loss affects the commission base, so loss% has a **cascading effect**.

---

## 💡 PRACTICAL SCENARIOS

### Scenario A: Good News (Goods Sell Higher)

```
Farmer Commission Example:

Farmer expected: 100kg @ ₹100 = ₹10,000
But goods sold at market premium: ₹110/kg
So we record: 100kg × ₹110 = ₹11,000

Commission effect:
  Our commission (10%): ₹1,100 💰 (more!)
  Farmer gets: ₹11,000 × 90% = ₹9,900
  
Farmer's perspective:
  Expected: ₹10,000 after commission = ₹9,000
  Actually gets: ₹9,900
  Bonus: +₹900 (market premium benefit)
  ✓ Everyone happy!
```

### Scenario B: Bad News (Major Damage)

```
Direct Purchase Example:

Ordered: 100 Box @ ₹1,000 = ₹100,000
Arrived: 85 Box (15 damaged in transit)

Bill:
  85 × ₹1,000 = ₹85,000
  Advance paid: ₹30,000 CASH
  Balance due: ₹55,000
  
Supplier's perspective:
  Expected receipt: ₹100,000 - ₹30,000 = ₹70,000
  Actually receiving: ₹85,000 - ₹30,000 = ₹55,000
  Loss: ₹15,000
  😞 Significant impact
```

### Scenario C: Cheque Not Cleared

```
Farmer Commission with Uncleared Cheque:

Bill after commission: ₹8,200
Cheque given: ₹5,000 (but NOT cleared yet)

Status: PENDING ⏳ (not PARTIAL!)
Reason: Cheque is uncleared, doesn't count as payment

Farmer's position:
  ✓ Bill recorded: ₹8,200
  ❌ No payment received yet (cheque still in process)
  ⏳ 100% of bill still due
  
After cheque clears:
  Status: Changes to PARTIAL ⚠️
  Payment effective: ₹5,000
  Balance now: ₹3,200
```

---

## 🎯 KEY FORMULAS AT A GLANCE

```
ADJUSTED_QTY = Initial_Qty × (1 - Less%/100)

DIRECT_BILL = Adjusted_Qty × Rate - Expenses

COMMISSION_BILL = Effective_Value × (1 - Commission%/100) - Expenses

BALANCE = BILL - Cleared_Advance

STATUS = {
  'paid'     if Balance ≈ 0
  'partial'  if Balance > 0 AND Cleared_Advance > 0  
  'pending'  if Balance > 0 AND Cleared_Advance = 0
}
```

---

## 🔍 WHICH TYPE TO USE?

```
Use DIRECT when:
  ✓ Buying from supplier (fixed price)
  ✓ Goods delivered complete
  ✓ No commission arrangement
  ✓ Simple goods (not market-dependent)

Use FARMER COMMISSION when:
  ✓ Buying from individual farmers
  ✓ Goods on consignment basis
  ✓ You take commission on sales
  ✓ Market-dependent pricing
  ✓ Typical 10-15% commission

Use SUPPLIER COMMISSION when:
  ✓ Buying from supplier partner
  ✓ Commission arrangement exists
  ✓ You earn commission on bulk sales
  ✓ Typical 5-10% commission
  ✓ Long-term supplier relationship
```

---

## ❗ CRITICAL DIFFERENCES

| Point | Direct | Farmer | Supplier |
|---|---|---|---|
| **Loss Impact** | Direct ₹ loss | ₹ loss + Commission effect | ₹ loss + Commission effect |
| **Commission** | None | Deducted from bill | Deducted from bill |
| **Calculation** | Simple multiplication | Complex with sales value | Complex with sales value |
| **Advance Effect** | Reduces balance | Reduces balance | Reduces balance |
| **Less% Effect** | Linear | Cascading | Cascading |
| **Code Branch** | `if (arrivalType === "direct")` | `else` block | `else` block (same path) |

---

## 📝 EXAMPLE: FULL CALCULATION

### The Same Goods, All Three Ways

```
=== GOODS SPECIFICATION ===
Quantity in: 100 kg Mango
Quality @ Receipt: 10 kg damaged (90% good)
Supplier Rate: ₹50/kg
Market Sell Rate: ₹55/kg
Expenses: ₹500
Advance: ₹2,000 CASH

═══════════════════════════════════════════════════════════════

METHOD 1: DIRECT PURCHASE
┌─────────────────────────────┐
│ We buy direct from exporter │
└─────────────────────────────┘

Bill Calculation:
  Adjusted Qty = 90 kg (lost 10%)
  Bill = 90 × ₹50 = ₹4,500
  Less Expenses: ₹500
  = ₹4,000
  Less Advance: ₹2,000
  ─────────────────────
  Balance: ₹2,000 ⚠️ PARTIAL

═══════════════════════════════════════════════════════════════

METHOD 2: FARMER COMMISSION (10%)
┌────────────────────────────────────┐
│ Consignment from farmer             │
│ We earn 10% commission on sales     │
└────────────────────────────────────┘

Bill Calculation:
  Adjusted Qty = 90 kg
  Base Value = 90 × ₹50 = ₹4,500
  Sold @ ₹55/kg = 90 × ₹55 = ₹4,950
  Use: ₹4,950 (actual sales) ✓
  
  Commission (10%): ₹4,950 × 10% = ₹495 💰 (WE GET THIS)
  Farmer gets: ₹4,950 - ₹495 = ₹4,455
  
  Less Expenses: ₹500
  = ₹3,955
  Less Advance: ₹2,000
  ─────────────────────
  Balance: ₹1,955 ⚠️ PARTIAL
  
  Farmer's Perspective:
  Expected: ₹5,000 - commission = ₹4,500
  lost 10% goods + 10% commission reduction
  Got: ₹3,955 after expenses

═══════════════════════════════════════════════════════════════

METHOD 3: SUPPLIER COMMISSION (8%)
┌─────────────────────────────────────┐
│ Consignment from supplier partner    │
│ We earn 8% commission on sales       │
└─────────────────────────────────────┘

Bill Calculation:
  Adjusted Qty = 90 kg
  Base Value = 90 × ₹50 = ₹4,500
  Sold @ ₹60/kg = 90 × ₹60 = ₹5,400
  Use: ₹5,400 (market rate higher) ✓
  
  Commission (8%): ₹5,400 × 8% = ₹432 💰 (WE GET THIS)
  Supplier gets: ₹5,400 - ₹432 = ₹4,968
  
  Less Expenses: ₹500
  = ₹4,468
  Less Advance: ₹2,000
  ─────────────────────
  Balance: ₹2,468 ⚠️ PARTIAL
  
  Supplier's Perspective:
  Expected: ₹5,000 - commission = ₹4,600
  Got: ₹4,468 (good deal despite commission)

═══════════════════════════════════════════════════════════════

SUMMARY COMPARISON:
┌──────────┬────────────┬────────────┬────────────┐
│ Method   │ Our Earn   │ Balance    │ Status     │
├──────────┼────────────┼────────────┼────────────┤
│ Direct   │ N/A        │ ₹2,000     │ ⚠️ PARTIAL │
│ Farmer   │ ₹495       │ ₹1,955     │ ⚠️ PARTIAL │
│ Supplier │ ₹432       │ ₹2,468     │ ⚠️ PARTIAL │
└──────────┴────────────┴────────────┴────────────┘
```

---

## ✅ VALIDATION QUESTIONS

Before recording a bill, ask:

1. **Is this Direct or Commission?**
   - Direct → Simpler path
   - Commission → Need commission %

2. **If Commission, do we have sales data?**
   - Yes → Use actual sales in bill
   - No → Use estimated base value

3. **What was the loss?**
   - None → 0% less
   - Some → Enter as whole number (5, 10, etc)

4. **Is the advance cleared?**
   - Cash/UPI → YES, counts toward balance
   - Cheque uncleared → NO, doesn't count yet
   - Credit → NO, zero advance

5. **What status will result?**
   - if balance ≈ 0 → PAID ✓
   - if balance > 0 AND advance given → PARTIAL ⚠️
   - if balance > 0 AND no advance → PENDING ⏳

---

**Created**: 2026-04-12  
**For Reference**: Use alongside PURCHASE_BILL_CALCULATION_GUIDE.md  
**Questions?**: Refer to PURCHASE_BILL_FORMULA_REFERENCE.md
