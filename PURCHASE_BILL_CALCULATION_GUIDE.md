# PURCHASE BILL CALCULATION - COMMISSION & LESS% EXPLAINED
**With Real Examples | Farmer vs Supplier | Less% Impact**

---

## BASIC FORMULA

### Step 1: Adjust Quantity for Less%
```
Adjusted Qty = Initial Qty - (Initial Qty × Less% / 100)

Example:
  Initial Qty: 100 kg
  Less%: 10% (weight loss during transport)
  Adjusted Qty = 100 - (100 × 10 / 100)
              = 100 - 10
              = 90 kg
```

### Step 2: Calculate Base Value
```
Base Value = Adjusted Qty × Supplier Rate

Example (continuing above):
  Adjusted Qty: 90 kg
  Supplier Rate: ₹100/kg
  Base Value = 90 × 100 = ₹9,000
```

### Step 3: Deduct Fixed Cuts (if any)
```
Value After Cuts = Base Value - Farmer Charges (Fixed)

Example:
  Base Value: ₹9,000
  Farmer Charges: ₹500 (fixed cut for misc charges)
  Value After Cuts = ₹9,000 - ₹500 = ₹8,500
```

---

## SCENARIO A: DIRECT PURCHASE (No Commission)

**Conditions**:
- No commission percentage
- Direct purchase from supplier
- Simpler calculation

### Calculation Formula
```javascript
Base Value = Adjusted Qty × Supplier Rate
Less Farmer Charges = 0 (usually)
Less Other Expenses = Packing + Loading + Transport
Less Advance Payment = (if cleared)

Net Payable = Base Value - Other Expenses - Advance
```

### Example
```
Starting Data:
  Initial Qty: 100 Box
  Supplier Rate: ₹1,000/Box
  Less%: 0% (no damage)
  Farmer Charges: ₹0
  Packing Cost: ₹200
  Loading Cost: ₹100
  Advance (CASH): ₹5,000 (cleared immediately)

CALCULATION:
  Step 1: Adjust Qty for Less%
          100 - (100 × 0 / 100) = 100 Box

  Step 2: Base Value
          100 Box × ₹1,000 = ₹100,000

  Step 3: Deduct Fixed Cuts
          ₹100,000 - ₹0 = ₹100,000

  Step 4: Deduct Expenses
          ₹100,000 - ₹200 - ₹100 = ₹99,700

  Step 5: Deduct Advance
          ₹99,700 - ₹5,000 = ₹94,700

RESULT:
  Gross Bill: ₹100,000
  Less Expenses: ₹300
  Net Payable: ₹99,700
  Advance Paid: ₹5,000
  Balance Pending: ₹94,700
```

---

## SCENARIO B: FARMER COMMISSION

**Conditions**:
- Commission on consignment goods from farmer
- Commission is % of goods value
- Commission REDUCES what we pay farmer

### Calculation Formula
```javascript
// Determine effective goods value
if (sale_items exist) {
  Effective Value = Sum of all sale values
} else {
  Effective Value = Base Value (estimation)
}

// Calculate commission
Commission Amount = (Effective Value × Commission%) / 100

// Calculate net payable
Net Payable = Effective Value 
            - Commission Amount 
            - Farmer Charges 
            - Expenses
            - Advance
            
Balance = Net Payable - Already Paid Advance
```

### Example with Farmer Commission
```
Starting Data:
  Initial Qty: 100 kg Mango
  Supplier Rate: ₹50/kg (cost price when bought)
  Less%: 5% (5 kg got damaged = 95 kg good)
  Commission %: 10% (our commission on goods)
  Farmer Charges: ₹200 (misc)
  Packing Cost: ₹100
  Loading Cost: ₹50
  Sales Data: ₹5,500 (sold at ₹58/kg average)
  Advance (UDHAAR): ₹0 (no advance, payment on credit)

CALCULATION:
  Step 1: Adjust for Less%
          100 - (100 × 5 / 100) = 95 kg good

  Step 2: Base Value (if not sold)
          95 kg × ₹50 = ₹4,750

  Step 3: Effective Value (from sales)
          Sales recorded: ₹5,500 ✓ (Use this instead)
          (We selling at ₹58/kg average)

  Step 4: Calculate Commission
          Commission = (₹5,500 × 10%) / 100
                     = ₹550
          (This is OUR profit from commission)

  Step 5: Deduct Commission & Charges
          ₹5,500 - ₹550 (commission) = ₹4,950
          ₹4,950 - ₹200 (farmer charges) = ₹4,750

  Step 6: Deduct Expenses
          ₹4,750 - ₹100 - ₹50 = ₹4,600

  Step 7: Deduct Advance
          ₹4,600 - ₹0 = ₹4,600

RESULT:
  Gross Value (from sales): ₹5,500
  Less Commission (10%): ₹550
  Less Farmer Charges: ₹200
  Less Expenses: ₹150
  NET TO PAY FARMER: ₹4,600
  Already Paid: ₹0
  Balance Pending: ₹4,600
  STATUS: ⏳ PENDING (full amount due)
```

### With Advance Payment (Farmer Commission)
```
Same as above BUT with ₹2,000 CASH advance given:

  Net to Pay: ₹4,600
  Advance (CASH - cleared): ₹2,000 ✓
  Balance Pending: ₹4,600 - ₹2,000 = ₹2,600
  STATUS: ⚠️ PARTIAL (₹2,600 still due)
```

---

## SCENARIO C: SUPPLIER COMMISSION

**Conditions**:
- Commission charged to supplier (not deducted from payment)
- Supplier bears commission cost
- We track it separately
- SAME calculation as farmer commission

### Example with Supplier Commission
```
Same calculation as farmer commission - the logic is identical:

Starting Data:
  Initial Qty: 50 Box Apples
  Supplier Rate: ₹2,000/Box
  Less%: 2% (1 box damaged)
  Commission%: 8% (supplier commission)
  Farmer Charges: ₹500
  Sales Data: ₹101,000 (49 boxes sold at ₹2,061/box avg)
  Advance (UPI/BANK): ₹30,000 (cleared immediately)

CALCULATION:
  Step 1: Adjust Qty
          50 - (50 × 2 / 100) = 49 Box

  Step 2: Base Value
          49 × ₹2,000 = ₹98,000

  Step 3: Use Sales Value (higher)
          Effective Value = ₹101,000 ✓

  Step 4: Calculate Commission
          Commission = (₹101,000 × 8%) = ₹8,080

  Step 5: Deduct Commission & Charges
          ₹101,000 - ₹8,080 - ₹500 = ₹92,420

  Step 6: Deduct Expenses
          ₹92,420 - ₹100 - ₹50 = ₹92,270

  Step 7: Deduct Advance
          ₹92,270 - ₹30,000 = ₹62,270

RESULT:
  Gross Value: ₹101,000
  Less Commission (8%): ₹8,080
  Less Charges: ₹500
  Less Expenses: ₹150
  Net Payable: ₹92,270
  Advance Paid (UPI): ₹30,000 ✓ Cleared
  Balance Pending: ₹62,270
  STATUS: ⚠️ PARTIAL
```

---

## LESS% DETAILED BREAKDOWN

### What is Less%?

**Less% = Weight Loss Percentage** during:
- Transport/transit damage
- Handling loss
- Physiological loss (fruits wilt, vegetables shrink)
- Spoilage

### How it Affects Bill

```
WITHOUT Less%:
  100 kg @ ₹100/kg = ₹10,000

WITH 10% Less:
  Step 1: Calculate reduced qty
          100 - 10 = 90 kg (lost 10 kg)
  
  Step 2: Bill on good qty
          90 kg @ ₹100/kg = ₹9,000
  
  Difference: Lose ₹1,000 in value

This is PAID BY FARMER, not us!
```

### Real Example: Mango Shipment

```
Scenario: Bought mango from farmer

Original Agreement:
  100 Boxes Mango
  Rate: ₹1,000/Box
  Total: ₹100,000

Actual Received:
  100 Boxes received
  But 8 boxes were damaged/rotted in transit
  Good boxes: 92

Bill Calculation:
  Qty Used = 92 (not 100)
  Rate: ₹1,000/Box
  Amount = 92 × ₹1,000 = ₹92,000
  
  Less% Breakdown:
  Original: ₹100,000
  Less (8 damaged): ₹8,000
  Net: ₹92,000
  
Commission deducted:
  Commission 10% on ₹92,000 = ₹9,200
  
Final Payment to Farmer:
  ₹92,000 - ₹9,200 = ₹82,800
```

---

## COMPARISON TABLE

| Aspect | Direct Purchase | Farmer Commission | Supplier Commission |
|---|---|---|---|
| **Who Sells** | Supplier directly | Farmer (consignment) | Supplier partner |
| **Commission Applied** | No | Yes, 10-15% typical | Yes, 5-10% typical |
| **Commission Paid By** | N/A | Farmer (deducted) | Supplier (deducted) |
| **Less% Effect** | Reduces qty, reduces bill | Reduces qty + affects commission base | Reduces qty + affects commission base |
| **Payment Logic** | Pay net bill only | Pay (bill - commission) | Pay (bill - commission) |
| **Status Calc** | Balance = Bill - Advance | Balance = (Bill - Commission) - Advance | Balance = (Bill - Commission) - Advance |

---

## SUMMARY: THE MASTER FORMULA

```javascript
// ═══════════════════════════════════════════════════════════
// UNIVERSAL PURCHASE BILL CALCULATION
// Works for: Direct + Farmer Commission + Supplier Commission
// ═══════════════════════════════════════════════════════════

STEP 1: ADJUST FOR LOSS
  goodQty = initialQty × (1 - lessPercent/100)
  Example: 100 × (1 - 5/100) = 95

STEP 2: DETERMINE EFFECTIVE VALUE
  if (hasRealSalesData) {
    effectiveValue = totalSalesAmt
  } else {
    effectiveValue = goodQty × supplierRate
  }

STEP 3: DEDUCT COMMISSION (if commission type)
  commissionAmt = effectiveValue × commissionPercent / 100
  valueAfterCommission = effectiveValue - commissionAmt

STEP 4: DEDUCT FIXED CUTS
  valueAfterCuts = valueAfterCommission - farmerCharges

STEP 5: DEDUCT VARIABLE EXPENSES
  netValue = valueAfterCuts - packingCost - loadingCost - transportCost

STEP 6: DEDUCT ADVANCE (if cleared)
  balancePending = netValue - clearedAdvance

STEP 7: DETERMINE STATUS
  if (Math.abs(balancePending) < 0.01) {
    status = 'paid'
  } else if (balancePending > 0 && clearedAdvance > 0) {
    status = 'partial'
  } else {
    status = 'pending'
  }

RESULT = {
  grossValue: effectiveValue,
  commission: commissionAmt,
  expenses: totalExpenses,
  netPayable: netValue,
  advancePaid: clearedAdvance,
  balance: balancePending,
  status: status
}
```

---

## PRACTICAL CHECKLIST

When entering a purchase bill, confirm:

- [ ] **Initial Qty**: Actual boxes/kg received
- [ ] **Less%**: If any damage/loss, enter %
- [ ] **Supplier Rate**: Cost per unit
- [ ] **Commission %**: 0 for direct, 5-15% for commission
- [ ] **Type**: farmer | supplier | direct
- [ ] **Sales Data**: If sold, record actual sales amount (overrides estimate)
- [ ] **Farmer Charges**: Any fixed deductions
- [ ] **Expenses**: Packing, loading, transport if any
- [ ] **Advance**: Amount & mode (cash/upi/cheque/credit)
- [ ] **Advance Status**: Cleared or pending (if cheque)

---

## EXAMPLES: INPUT → OUTPUT

### Example 1: Direct (Simple)
```
INPUT:
  Qty: 100, Rate: ₹100, Less: 0%, Commission: 0%
  Advance: ₹5,000 CASH

OUTPUT:
  Gross: ₹10,000
  Net: ₹10,000
  Balance: ₹5,000
  Status: PARTIAL
```

### Example 2: Farmer Commission with Loss
```
INPUT:
  Qty: 100, Rate: ₹100, Less: 10%, Commission: 10%
  Sales: ₹9,500, Advance: ₹0

OUTPUT:
  Gross: ₹9,500 (from sales)
  Commission: ₹950
  Net: ₹8,550
  Balance: ₹8,550
  Status: PENDING
```

### Example 3: Supplier Commission with Advance
```
INPUT:
  Qty: 50, Rate: ₹2,000, Less: 2%, Commission: 8%
  Sales: ₹101,000, Advance: ₹30,000 UPI

OUTPUT:
  Gross: ₹101,000
  Commission: ₹8,080
  Net: ₹92,920
  Balance: ₹62,920
  Status: PARTIAL
```

---

**KEY TAKEAWAY:**
The calculation is **IDENTICAL** for farmer and supplier commission - the only difference is the **meaning** (who benefits) and possibly the **typical %** rate. Both deduct commission from the payable amount.
