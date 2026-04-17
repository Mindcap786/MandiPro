# PURCHASE BILL CALCULATION - FORMULA REFERENCE
**Visual Breakdown | Step-by-Step Formula | Code Implementation**

---

## 📊 VISUAL FORMULA FLOW

```
┌─────────────────────────────────────────────────────────────┐
│ PURCHASE BILL CALCULATION - UNIVERSAL FORMULA               │
└─────────────────────────────────────────────────────────────┘

INPUT DATA
├─ Initial Qty (e.g., 100 kg)
├─ Supplier Rate (e.g., ₹100/kg)
├─ Less % (e.g., 5%)
├─ Commission % (e.g., 10%) 
├─ Farmer Charges (e.g., ₹200)
├─ Sales Amount (e.g., ₹9,500)
├─ Expenses: Packing, Loading, Transport
└─ Advance: Amount + Mode (Cash/UPI/Cheque/Credit)

     ↓ ↓ ↓
     
STEP 1: ADJUST QUANTITY
        Adjusted Qty = Qty - (Qty × Less% / 100)
        │
        └─→ Example: 100 - (100 × 5 / 100) = 95 kg

STEP 2: CALCULATE BASE VALUE
        Base Value = Adjusted Qty × Supplier Rate
        │
        └─→ Example: 95 × ₹100 = ₹9,500

STEP 3: DETERMINE EFFECTIVE VALUE
        if (Sales Data exists) {
          Effective Value = Sales Amount  ✓ ACTUAL
        } else {
          Effective Value = Base Value    ✓ ESTIMATE
        }
        │
        └─→ Example: Use ₹9,500 (if sold)

STEP 4: APPLY COMMISSION (if commission mode)
        Commission Amt = (Effective Value × Commission%) / 100
        Value After Commission = Effective Value - Commission Amt
        │
        └─→ Example: 
            Commission = (₹9,500 × 10%) / 100 = ₹950
            After = ₹9,500 - ₹950 = ₹8,550

STEP 5: DEDUCT FIXED CUTS
        Value = Value - Farmer Charges
        │
        └─→ Example: ₹8,550 - ₹200 = ₹8,350

STEP 6: DEDUCT VARIABLE EXPENSES
        Value = Value - Packing - Loading - Transport
        │
        └─→ Example: ₹8,350 - ₹100 - ₹50 = ₹8,200

STEP 7: DEDUCT ADVANCE (if cleared)
        BALANCE = Value - Cleared Advance
        │
        └─→ Example: ₹8,200 - ₹0 = ₹8,200

STEP 8: DETERMINE STATUS
        if (BALANCE ≈ 0) → PAID ✓
        else if (BALANCE > 0 AND Advance > 0) → PARTIAL ⚠️
        else → PENDING ⏳

OUTPUT
├─ Gross Bill Amount
├─ Less: Commission
├─ Less: Charges & Expenses
├─ Net Payable
├─ Minus: Advance Paid
├─ Balance Pending
└─ Status: PAID | PARTIAL | PENDING
```

---

## 🔢 MATHEMATICAL FORMULA

### DIRECT PURCHASE (No Commission)
```
Net Bill = (InitialQty - InitialQty×Less%/100) × Rate - Expenses - Advance
         = Adjusted Qty × Rate - Expenses - Advance
```

### COMMISSION PURCHASE (Farmer or Supplier)
```
Effective Value = MAX(Sales Amount, Base Value)
                = MAX(Actual Sales, Adjustd Qty × Rate)

Net Bill = Effective Value 
         - (Effective Value × Commission% / 100)
         - Farmer Charges
         - Expenses
         - Advance

        = Effective Value × (1 - Commission%/100)
         - Farmer Charges
         - Expenses
         - Advance
```

### BALANCE TO PAY
```
Balance = Net Bill - Cleared Advance

Where: Cleared Advance = {
  Advance,           if mode in [CASH, UPI/BANK, CHEQUE(cleared)]
  0,                 if mode = CREDIT or CHEQUE(not cleared)
}
```

---

## 💻 CODE IMPLEMENTATION

### Function: `calculateLotGrossValue(lot)`
```typescript
export function calculateLotGrossValue(lot: any) {
    const qty = toNumber(lot?.initial_qty);                    // 100
    const rate = toNumber(lot?.supplier_rate);                 // 100
    const lessPercent = toNumber(lot?.less_percent);           // 5
    const otherCut = toNumber(lot?.farmer_charges);            // 200
    const packingCost = toNumber(lot?.packing_cost);           // 100
    const loadingCost = toNumber(lot?.loading_cost);           // 50
    const transportShare = toNumber(lot?.transport_share);     // 0
    const arrivalType = getArrivalType(lot);                   // 'commission'

    // STEP 1: Adjust for less%
    const adjustedQty = qty - (qty * lessPercent) / 100;       // 100 - 5 = 95
    
    // STEP 2: Base value
    const baseAdjustedValue = adjustedQty * rate;              // 95 × 100 = 9500
    
    // STEP 3: After farmer charges
    const adjustedValue = baseAdjustedValue - otherCut;        // 9500 - 200 = 9300

    // STEP 4: Direct purchase (no commission)
    if (arrivalType === "direct") {
        return adjustedValue;                                  // Return 9300
    }

    // STEP 5: Commission purchase - get effective value
    const salesSum = Array.isArray(lot?.sale_items)
        ? lot.sale_items.reduce((sum: number, item: any) => 
            sum + toNumber(item?.amount), 0)
        : 0;                                                   // 0 or actual sales
    
    const effectiveGoodsValue = salesSum > 0 
        ? salesSum                                             // Use if sold
        : baseAdjustedValue;                                   // Otherwise estimate

    // STEP 6: Calculate commission (DEDUCTED)
    const commissionAmount =
        (effectiveGoodsValue * toNumber(lot?.commission_percent)) / 100;
        // (9300 × 10%) / 100 = 930
    
    // STEP 7: Calculate lot expenses
    const lotExpenses = packingCost + loadingCost + transportShare;
    // 100 + 50 + 0 = 150

    // STEP 8: Final net value
    return effectiveGoodsValue - commissionAmount - otherCut - lotExpenses;
    // 9300 - 930 - 200 - 150 = 8020
}
```

### Function: `calculatePaymentStatus(lot)`
```typescript
export function calculatePaymentStatus(lot: any): 'paid' | 'partial' | 'pending' {
    const AMOUNT_EPSILON = 0.01;
    
    // Get net bill amount (function above)
    const netBillAmount = calculateLotGrossValue(lot);         // 8020
    
    // Get advance paid
    const advancePaid = toNumber(lot?.advance);                // 2000
    
    // Check if cleared
    const isPaymentCleared = 
        !lot?.advance_payment_mode || 
        ['cash', 'bank', 'upi', 'UPI/BANK'].includes(lot.advance_payment_mode) || 
        lot.advance_cheque_status === true;
         // true if cash/upi, false if uncleared cheque or credit
    
    // Calculate balance
    const effectivePaidAmount = isPaymentCleared ? advancePaid : 0;
    const balancePending = netBillAmount - effectivePaidAmount;
    // 8020 - 2000 = 6020
    
    // Status
    if (Math.abs(balancePending) < AMOUNT_EPSILON) {
        return 'paid';          // Balance ≈ 0
    } else if (balancePending > AMOUNT_EPSILON && effectivePaidAmount > AMOUNT_EPSILON) {
        return 'partial';       // Balance > 0 AND Advance > 0
    } else {
        return 'pending';       // Balance > 0 BUT No Advance
    }
}

// OUTPUT: 'partial' (because 6020 > 0 AND 2000 > 0)
```

---

## 📋 STEP-BY-STEP EXAMPLE

### Scenario: Farmer Commission with Loss

```
INPUT:
┌─────────────────────────────────┐
│ Initial Qty: 100 kg             │
│ Supplier Rate: ₹100/kg          │
│ Less%: 5% (weight loss)         │
│ Commission%: 10%                │
│ Farmer Charges: ₹200            │
│ Packing: ₹100                   │
│ Loading: ₹50                    │
│ Transport: ₹0                   │
│ Sales Amount: ₹9,500 (if sold)  │
│ Advance: ₹2,000 CASH            │
└─────────────────────────────────┘

CALCULATION:

Step 1: Adjust for Less%
        Adjusted Qty = 100 - (100 × 5 / 100)
                     = 100 - 5
                     = 95 kg ✓

Step 2: Base Value  
        Base = 95 × ₹100
             = ₹9,500

Step 3: Effective Value
        Sales recorded? YES → ₹9,500 ✓ (ACTUAL)
        Use: ₹9,500

Step 4: Calculate Commission
        Commission = (₹9,500 × 10%) / 100
                   = ₹950
        After Commission = ₹9,500 - ₹950
                        = ₹8,550

Step 5: Deduct Farmer Charges
        ₹8,550 - ₹200
        = ₹8,350

Step 6: Deduct Expenses
        ₹8,350 - ₹100 - ₹50 - ₹0
        = ₹8,200

Step 7: Check if Advance Cleared
        Mode: CASH
        Cleared? YES ✓
        Amount: ₹2,000

Step 8: Calculate Balance
        Balance = ₹8,200 - ₹2,000
                = ₹6,000

Step 9: Determine Status
        Is Balance ≈ 0? NO
        Is Balance > 0 AND Advance > 0? YES ✓
        Status = PARTIAL ⚠️

OUTPUT:
┌────────────────────────────────┐
│ Gross Bill: ₹9,500             │
│ Less Commission (10%): ₹950    │
│ Less Farmer Charges: ₹200      │
│ Less Expenses: ₹150            │
│ ─────────────────────          │
│ NET TO PAY: ₹8,200             │
│ Advance Paid: ₹2,000 ✓         │
│ ─────────────────────          │
│ BALANCE PENDING: ₹6,000        │
│ STATUS: ⚠️ PARTIAL             │
└────────────────────────────────┘
```

---

## ⚖️ LESS% IMPACT ANALYSIS

### How Less% Changes the Bill

```
WITHOUT LESS%:
Base = 100 × ₹100 = ₹10,000
Commission (10%) = ₹1,000
Net = ₹9,000

WITH 5% LESS:
Adjusted = 100 - 5 = 95
Base = 95 × ₹100 = ₹9,500
Commission (10%) = ₹950
Net = ₹8,550
─────────────────
DIFFERENCE: -₹450 (farmer loses this)

WITH 10% LESS:
Adjusted = 100 - 10 = 90
Base = 90 × ₹100 = ₹9,000
Commission (10%) = ₹900
Net = ₹8,100
─────────────────
DIFFERENCE: -₹900 (farmer loses double)

WITH 20% LESS:
Adjusted = 100 - 20 = 80
Base = 80 × ₹100 = ₹8,000
Commission (10%) = ₹800
Net = ₹7,200
─────────────────
DIFFERENCE: -₹1,800 (farmer loses significant amount)
```

**KEY INSIGHT**: Less% reduces BOTH base value AND commission amount (because commission is % of reduced value).

---

## 🎯 QUICK REFERENCE FORMULAS

### For Direct Purchase (Simplest)
```
BILL = (Qty - Qty×Less%/100) × Rate - Expenses - Advance
```

### For Farmer Commission
```
BILL = Effective Value 
     × (100 - Commission%) / 100 
     - FarmerCharges
     - Expenses
     - Advance
```

### For Supplier Commission
```
Same as Farmer Commission 
(identical calculation, different business meaning)
```

### Balance Calculation
```
BALANCE = BILL 
        - ClearedAdvance
        
ClearedAdvance = {
  Advance        if payment_mode = CASH or UPI/BANK or CHEQUE(cleared)
  0              if payment_mode = CREDIT or CHEQUE(not cleared)
}
```

### Status Determination
```
Status = 
  PAID if BALANCE ≈ 0 (< ₹0.01)
  PARTIAL if BALANCE > 0 AND ClearedAdvance > 0
  PENDING otherwise
```

---

## ❓ FREQUENTLY ASKED QUESTIONS

### Q: Why does commission reduce the bill?
**A**: Because commission is OUR earning. We take commission for managing the sale, so farmer gets less.
```
Farmer brings goods worth ₹100
We take 10% commission = ₹10
Farmer gets: ₹100 - ₹10 = ₹90
```

### Q: Does Less% affect both buyer and seller?
**A**: NO. Only the SELLER loses.
```
Goods worth ₹100 arrived damaged (10% loss)
Buyer only pays for 90 kg: ₹90
Farmer/Supplier loses ₹10 from the damage
```

### Q: Can commission be more than 20%?
**A**: Yes, depends on agreement. Common ranges:
```
- Farmers: 5-15% (per mandi standards)
- Suppliers: 3-10% (per supplier agreement)
```

### Q: What if sales amount is LESS than base value?
**A**: We use the higher value (base) for commission calculation.
```
Base Value: ₹10,000
Sales Amount: ₹9,500 (sold at loss)
Effective Value: ₹10,000 (use base, farmer doesn't lose extra)
```

### Q: Is Less% entered as whole number or decimal?
**A**: Whole number (e.g., enter "5" for 5%, not "0.05")
```
Correct: less_percent = 5          (5 kg out of 100)
Wrong: less_percent = 0.05         (0.5 kg only)
```

---

## 🔄 COMPLETE DATA FLOW

```
User Entry (Quick Purchase Form)
    ├─ Qty: 100
    ├─ Rate: ₹100
    ├─ Less%: 5
    ├─ Commission%: 10
    ├─ Farmer Charges: ₹200
    ├─ Expenses: ₹150
    └─ Advance: ₹2,000 CASH

        ↓ Form Validation ↓

Database Storage (mandi.lots)
    ├─ initial_qty: 100
    ├─ supplier_rate: 100
    ├─ less_percent: 5
    ├─ commission_percent: 10
    ├─ farmer_charges: 200
    ├─ packing_cost: 100
    ├─ loading_cost: 50
    ├─ advance: 2000
    └─ advance_payment_mode: 'cash'

        ↓ calculateLotGrossValue() ↓

Calculated Values:
    ├─ Adjusted Qty: 95
    ├─ Gross Bill: ₹9,500
    ├─ Commission: ₹950
    ├─ Net Payable: ₹8,200
    └─ [returned to UI]

        ↓ calculatePaymentStatus() ↓

Payment Status:
    ├─ Cleared Advance: ₹2,000
    ├─ Balance: ₹6,000
    └─ Status: PARTIAL ⚠️

        ↓ Display to User ↓

Purchase Bill Display
    ├─ Gross: ₹9,500
    ├─ Commission: ₹950
    ├─ Expenses: ₹150
    ├─ Net: ₹8,200
    ├─ Paid: ₹2,000
    ├─ Balance: ₹6,000
    └─ Status: ⚠️ PARTIAL
```

---

## ✅ VALIDATION CHECKLIST

Before saving a bill, verify:

- [ ] Initial Qty matches physical receipt
- [ ] Less% accurately reflects damage/loss
- [ ] Commission% matches your commission agreement
- [ ] Farmer Charges include all fixed deductions
- [ ] Expenses are complete (packing, loading, transport)
- [ ] Advance amount doesn't exceed net bill
- [ ] Advance mode is recorded correctly
- [ ] If commission, sales amount entered if goods sold

---

**Version**: 1.0  
**Last Updated**: 2026-04-12  
**Use With**: PURCHASE_BILL_CALCULATION_GUIDE.md
