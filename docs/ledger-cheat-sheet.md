# Ledger Cheat Sheet — How Each Transaction Should Look

**Audience:** Anyone (even a 10th-standard student) who wants to check whether a
voucher in MandiPro is correct.

**The one rule you need to remember:**
> For every voucher, **Debit must equal Credit**. Always. No exceptions.
>
> If Dr ≠ Cr, the voucher is broken.

Every transaction below follows this rule. The left column always equals the
right column.

---

## 1. Quick Purchase / Arrival from a Farmer (on credit / udhaar)

**What happens in real life:** A farmer brings 40 bags of tomato. You book an
arrival for ₹10,000. You don't pay right now — it's udhaar.

**What the DB should look like:** ONE voucher with TWO ledger legs.

| Leg | Account / Party  | Debit  | Credit | Meaning                             |
|-----|------------------|--------|--------|-------------------------------------|
| 1   | Purchase A/c     | 10,000 |    —   | "Goods came in, worth ₹10,000"      |
| 2   | Farmer (Mubarak) |    —   | 10,000 | "I owe Mubarak ₹10,000"             |
|     | **TOTAL**        |**10,000**|**10,000**| ✓ Balanced                      |

**In the Day Book this should show as ONE card:** `Mubarak · Purchase · ₹10,000 · Udhaar`.

**Red flag:** If you see `Unknown · Fruit Value · ₹10,000` AS A SEPARATE ROW
next to the Mubarak row, it means leg 1 was duplicated into its own orphan
voucher. That is a bug, and your audit will catch it in **Q1** and **Q4**.

---

## 2. Quick Purchase paid immediately in CASH

**What happens:** Farmer brings goods, you pay cash on the spot.

**DB: ONE voucher, FOUR ledger legs.**

| Leg | Account / Party   | Debit  | Credit | Meaning                         |
|-----|-------------------|--------|--------|---------------------------------|
| 1   | Purchase A/c      | 10,000 |    —   | Goods received                  |
| 2   | Farmer (Mubarak)  |    —   | 10,000 | Payable created                 |
| 3   | Farmer (Mubarak)  | 10,000 |    —   | Payable settled                 |
| 4   | Cash              |    —   | 10,000 | Cash went out                   |
|     | **TOTAL**         |**20,000**|**20,000**| ✓ Balanced                  |

Legs 2 and 3 cancel each other out on the farmer's ledger (net zero — nothing
owed). The effect is: goods worth ₹10,000 came in, ₹10,000 cash went out.

**Day Book should show:** ONE card, `Mubarak · Purchase · ₹10,000 · Full Cash Paid`.

---

## 3. Quick Purchase paid by UPI / Bank Transfer

Same as cash — just replace the "Cash" account with "Bank - HDFC" (or whichever).

| Leg | Account / Party  | Debit  | Credit |
|-----|------------------|--------|--------|
| 1   | Purchase A/c     | 10,000 |    —   |
| 2   | Farmer           |    —   | 10,000 |
| 3   | Farmer           | 10,000 |    —   |
| 4   | Bank - HDFC      |    —   | 10,000 |
|     | **TOTAL**        |**20,000**|**20,000**|

---

## 4. Quick Purchase paid by CHEQUE (pending)

A cheque that hasn't cleared yet. The purchase is booked immediately, but the
cash hasn't moved.

**DB: ONE purchase voucher + ONE payment voucher (`cheque_status = 'pending'`).**

Purchase voucher (same as udhaar — leg 1 + leg 2 above).

Payment voucher, held in pending state:

| Leg | Account / Party  | Debit  | Credit | Meaning                   |
|-----|------------------|--------|--------|---------------------------|
| 1   | Farmer           | 10,000 |    —   | Settles the payable       |
| 2   | Bank (pending)   |    —   | 10,000 | Bank balance will go down |

The Day Book should show this as ONE card with a **yellow "Cheque Pending"**
badge. When you mark the cheque cleared, the status flips and the amount moves
out of bank.

**Red flag:** If cheques keep accumulating in the day book after they've been
marked cleared, the `clear_cheque` RPC isn't firing — check Q2 for one-legged
vouchers.

---

## 5. Sale to a Buyer (on credit / udhaar)

**Real life:** Buyer "Asif" buys 40 bags for ₹10,000, hasn't paid yet.

**DB: ONE sale voucher, TWO legs.**

| Leg | Account / Party  | Debit  | Credit |
|-----|------------------|--------|--------|
| 1   | Buyer (Asif)     | 10,000 |    —   | Asif owes me ₹10,000      |
| 2   | Sales Revenue    |    —   | 10,000 | Income earned             |
|     | **TOTAL**        |**10,000**|**10,000**|                       |

---

## 6. Sale paid in cash right away

**DB: ONE voucher, FOUR legs** (mirror of the cash purchase above).

| Leg | Account / Party  | Debit  | Credit |
|-----|------------------|--------|--------|
| 1   | Buyer            | 10,000 |    —   |
| 2   | Sales Revenue    |    —   | 10,000 |
| 3   | Cash             | 10,000 |    —   |
| 4   | Buyer            |    —   | 10,000 |
|     | **TOTAL**        |**20,000**|**20,000**|

---

## 7. Make Payment (manual "Payment & Receipts" dialog)

**Real life:** You've had an udhaar with Mubarak for a while. Today you pay him
₹10,000 cash.

**DB: ONE payment voucher, TWO legs.**

| Leg | Account / Party  | Debit  | Credit |
|-----|------------------|--------|--------|
| 1   | Mubarak          | 10,000 |    —   | Clears his payable  |
| 2   | Cash             |    —   | 10,000 | Cash went out       |
|     | **TOTAL**        |**10,000**|**10,000**|                 |

On the Payments & Receipts page this shows as: `Mubarak · Make Payment · ₹10,000 · Dr`.

**Red flag:** If this page also shows a `Purchase · Mubarak · ₹10,000` row on
the same day, you have a duplicate. We just fixed the filter so the Purchase
row no longer leaks in here, but it should still be present in the Day Book /
Purchase Register — not here.

---

## 8. Receive Money (manual "Payment & Receipts" dialog)

**Real life:** Asif pays you the ₹10,000 he owed.

**DB: ONE receipt voucher, TWO legs.**

| Leg | Account / Party  | Debit  | Credit |
|-----|------------------|--------|--------|
| 1   | Cash             | 10,000 |    —   |
| 2   | Asif             |    —   | 10,000 | Clears his receivable |
|     | **TOTAL**        |**10,000**|**10,000**|                 |

---

## 9. Mandi Expense (shop rent, hamali, petrol, etc.)

| Leg | Account / Party          | Debit  | Credit |
|-----|--------------------------|--------|--------|
| 1   | Expense A/c (e.g. Rent)  | 10,000 |    —   |
| 2   | Cash / Bank              |    —   | 10,000 |
|     | **TOTAL**                |**10,000**|**10,000**|

---

## How to read the audit output

When you run [`scripts/audit-daybook-and-finance.sql`](../scripts/audit-daybook-and-finance.sql):

| Query | What it finds                      | Healthy output      |
|-------|------------------------------------|---------------------|
| Q1    | Vouchers where Dr ≠ Cr             | **0 rows**          |
| Q2    | Vouchers with 0 or 1 ledger legs   | **0 rows**          |
| Q3    | Vouchers > ₹1 crore (typo filter)  | 0 rows (or small)   |
| Q4    | Arrivals with >1 purchase voucher  | **0 rows**          |
| Q5    | Sales with >1 sale voucher         | **0 rows**          |
| Q6    | Purchase legs with NULL reference  | **0 rows**          |
| Q7    | Ledger entries whose voucher is deleted | **0 rows**     |
| Q8    | True daily totals (fixed)          | Dr = Cr every row   |
| Q9    | Cash & Bank balances from ledger   | Matches UI          |
| Q10   | Party balances                     | Matches Finance UI  |
| Q11   | Mubarak drill-down                 | Matches case 1/2    |
| Q12   | That 1-April ₹68 crore voucher     | Investigate         |

**Any row where `Q1` has output is a bug you must fix at the data level** — the
Day Book / Finance UI cannot hide broken double-entry by itself.

---

## Decision tree when a voucher looks wrong

```
Is Dr = Cr on this voucher?
├── Yes → the data is fine; check the UI grouping
│          (see getEntryGroupKey in day-book.tsx)
│
└── No  → the voucher itself is broken.
          ├── One leg missing   → someone aborted mid-insert
          ├── Huge number       → typo or test data
          └── Multiple vouchers → old RPC ran twice, clean up
```
