# Day Book + Finance Reliability Plan

**Status:** Draft / awaiting approval before code & DB changes
**Owner:** Claude (acting as senior fintech / ERP engineer)
**Scope:** Day Book, Finance Overview, Payments & Receipts — make them behave like Tally / Busy / Zoho Books for a mandi owner, with zero duplicates and zero silent corruption.

---

## 1. What's wrong today (the short version)

The mandi owner is seeing:

1. **Duplicate rows in Payments & Receipts** — one "Purchase · Mubarak · ₹10,000" *and* one "Make Payment · Mubarak · ₹10,000" for the same arrival. [FIXED in code — details below.]
2. **"Unknown · Fruit Value · ₹10,000" phantom rows** in the Day Book next to the real Mubarak purchase row.
3. **Massive corruption** in the underlying data: at least one payment voucher on **2026-04-01** worth **₹34,00,01,000 (~₹34 crore)** with **two debit legs and zero credit legs** — double-entry is broken, cheque no. `999999`, party "new suppliers". Day Book totals for that day are poisoned by this one voucher.
4. **Day Book and Finance Overview both trust the bad data** and display it, because neither layer validates Dr = Cr before computing summaries.

The root cause is not UI. The root cause is that **the data layer allowed unbalanced vouchers to exist**, and the UI is faithfully rendering garbage.

---

## 2. How each page works *today* (what's present)

### 2.1 Payments & Receipts — [web/app/(main)/finance/payments/page.tsx](web/app/(main)/finance/payments/page.tsx)

- Queries `mandi.vouchers` joined with `ledger_entries`.
- **Previously fetched ALL voucher types.** That's why purchase vouchers leaked into a page that, by industry convention, should only show `receipt` and `payment` vouchers.
- **Fix already applied** at [page.tsx:106](web/app/(main)/finance/payments/page.tsx#L106):
  ```ts
  .in('type', ['receipt', 'payment'])
  ```
- ✅ After this fix, Payments & Receipts = strict cash/bank movement register, matching Tally's "Payment Voucher" + "Receipt Voucher" registers.

### 2.2 Day Book — [web/components/finance/day-book.tsx](web/components/finance/day-book.tsx) (~1,927 lines)

- Queries `mandi.ledger_entries` (the **leg** table, not the voucher table) and then tries to **reconstruct vouchers client-side** using:
  - `getEntryGroupKey()` — heuristic that groups legs by `transaction_type + reference_id`, `voucher_id`, `arrival_id`, or text patterns.
  - `getGroupRepresentative()` — picks one leg per group to render as a card.
  - `inferVoucherFlow()` — maps raw types to UI categories.
- This is **backwards**: Tally-style Day Books always render one card per voucher because the DB already groups legs by `voucher_id`. Reconstructing groups client-side is brittle — if any leg is orphaned, mis-typed, or has a stale `reference_id`, it shows up as "Unknown".
- Render shell (the visual layout) is fine and stays. What has to change is the data pipeline.

### 2.3 Finance Overview — [web/components/finance/finance-dashboard.tsx](web/components/finance/finance-dashboard.tsx)

- Calls an RPC `get_financial_summary(p_org_id)` (defined in the remote Supabase DB, not in this repo).
- Queries view `view_party_balances` (also defined only in the remote DB).
- Computes bank balances by summing `debit − credit` directly from `ledger_entries` for asset accounts.
- **No voucher-level sanity check.** One ₹34 crore broken voucher inflates payables by ₹34 crore.

### 2.4 Underlying data (what the SQL audit found)

- Q5 daily totals show unbalanced days (e.g. `2026-04-01 payment | dr=680002000 | cr=680002000 | imbalance=0` at the day level — but Q12 shows that imbalance at the *voucher* level is not zero). This is the ₹34 crore phantom.
- Q12 output confirmed voucher `efaf594c-9513-48b8-9bc9-a9ecd7124d83`:
  - type = `payment`, amount = `340001000`
  - Two ledger legs, **both debit**, zero credits → Dr − Cr = **₹34 crore imbalance**.
  - narration references cheque `999999`, party "new suppliers" — classic test/typo data.
- Q1, Q2, Q4 have not been run yet. Those results will tell us the full blast radius.

---

## 3. How each page *should* work (industry standard)

Reference: Tally.ERP 9 / TallyPrime / Busy / Zoho Books. Every serious accounting package follows the same contract:

> **One voucher = one card. All legs of that voucher are rendered under that card as Dr/Cr lines. Debit always equals Credit.**

### 3.1 Day Book (end-of-day view a mandi owner actually needs)

For any given day, the Day Book should show:

1. **Opening cash + bank balance** (carried over from prior day).
2. **Cash Book column** — every voucher that touched cash, in chronological order.
3. **Bank Book column** — same for each bank account.
4. **Voucher rows** — grouped by voucher number, each showing:
   - Time, voucher no., voucher type badge (Purchase / Sale / Payment / Receipt / Expense / Journal).
   - Party name (resolved from `contact_id`).
   - Narration (arrival qty, commodity, bill no.).
   - **All Dr legs and Cr legs**, with a running total `Dr = Cr`.
5. **Cheque-pending section** — separate list of vouchers where `cheque_status = 'pending'`.
6. **Trial balance footer** — `Total Dr | Total Cr | Balanced ✓ or Imbalanced ⚠️`.
7. **Closing cash + bank balance.**

What must **not** happen:
- Same voucher showing twice under different names ("mubarak" and "Unknown").
- Unbalanced vouchers counted in summary totals without a warning.
- Pending cheques double-counted with their parent purchase.

### 3.2 Finance Overview

- Totals for Sales / Purchases / Payables / Receivables / Cash / Bank must all come from a single source of truth: the ledger, **filtered to balanced vouchers only**.
- Imbalanced vouchers get bucketed into a "⚠️ Data Issues" card — visible, but not counted in KPIs so they can't lie to the owner.
- Party list (payables/receivables) stays ordered by net balance.

### 3.3 Payments & Receipts

- Already correct after the `.in('type', ['receipt', 'payment'])` fix — this is the industry-standard cash book view.
- Add one safety-net: skip vouchers where Dr ≠ Cr and surface them in a "Needs review" badge.

---

## 4. Proposed changes (what I'm actually changing)

### 4.1 Code changes — surgical, no rewrites

| File | Change | Risk |
|---|---|---|
| [day-book.tsx](web/components/finance/day-book.tsx) | Replace `fetchDayBook` to query `vouchers` + embedded `ledger_entries`, group naturally by `voucher_id`. Keep existing render shell. Add trial-balance footer. Add per-voucher "⚠️ Imbalanced" badge. Skip unbalanced vouchers from summary cards. | Low — same visual output, cleaner data pipeline. |
| [day-book.tsx](web/components/finance/day-book.tsx) | Retain `getEntryGroupKey` safety-net (already added `voucher.arrival_id` preference) as a fallback for legacy data where `voucher_id` is still null. | None — defensive only. |
| [finance-dashboard.tsx](web/components/finance/finance-dashboard.tsx) | After RPC response, post-filter any imbalanced voucher IDs out of the totals. Add a "Data Issues (N)" banner card linking to Day Book. | Low — pure read side. |
| [payments/page.tsx](web/app/(main)/finance/payments/page.tsx) | Already fixed (`type` filter). Add the same imbalanced-voucher badge here for consistency. | None. |
| New: [lib/finance/voucher-integrity.ts](web/lib/finance/voucher-integrity.ts) | Small pure util — `isVoucherBalanced(lines) → boolean`, `getVoucherImbalance(lines) → number`. Used by all three pages. | None — new file, zero couplings. |

### 4.2 Data / DB changes — behind user approval

| Step | Action | Reversibility |
|---|---|---|
| D1 | Run [audit-daybook-and-finance.sql](scripts/audit-daybook-and-finance.sql) Q1, Q2, Q4 to get exact list of imbalanced / phantom / duplicate vouchers. | Read only. |
| D2 | Surgical DELETE of the confirmed ₹34 crore voucher `efaf594c-9513-48b8-9bc9-a9ecd7124d83` and its ledger legs. Wrapped in `BEGIN`...`COMMIT` with verification. | Reversible via backup. |
| D3 | Run [cleanup-duplicate-purchase-vouchers.sql](scripts/cleanup-duplicate-purchase-vouchers.sql) to dedupe arrivals with >1 purchase voucher and regenerate via `post_arrival_ledger`. | Reversible via backup. |
| D4 | Add a DB constraint: `CHECK` trigger on `mandi.ledger_entries` that rejects inserts where the voucher's cumulative `Dr - Cr` isn't zero at commit time (deferred constraint). | Additive — reversible. |

**Nothing in D2/D3/D4 runs until the user says "go".** Step D4 is the long-term fix that makes it physically impossible for unbalanced vouchers to exist again.

---

## 5. Why this order

1. **Ship the code changes first.** They're safe, reversible, and immediately make the UI correct even while bad data still exists — because imbalanced vouchers get quarantined in their own "Data Issues" lane instead of poisoning totals.
2. **Then run the audit + cleanup.** With the UI already correct, cleanup becomes a data-hygiene task, not an emergency.
3. **Then add the DB constraint.** Once the data is clean, lock the door so it can't get dirty again.

This is how every production ERP migration is done: fix the *read path* first, clean the *data*, then harden the *write path*.

---

## 6. What this does **not** touch

- No changes to the voucher-writing RPCs (`record_quick_purchase`, `post_arrival_ledger`, `confirm_sale_transaction`) in this pass. Those are already correct after the strict-no-duplicates migration (`20260406120000_strict_no_duplicate_transactions.sql`). If the audit shows new bugs there, that's a separate PR.
- No schema migrations to the tables.
- No changes to the mobile Day Book yet (mobile still renders via the same component).

---

## 7. Acceptance criteria (how we know it's done)

- [ ] Day Book shows exactly one card per voucher, never "Unknown" phantoms.
- [ ] Day Book footer shows `Total Dr = Total Cr` with a green ✓ on clean days.
- [ ] Any imbalanced voucher shows a yellow ⚠️ badge and is excluded from Sales/Purchase/Liquid/Expenses summary cards.
- [ ] Finance Overview KPIs match Q9 + Q10 of [audit-daybook-and-finance.sql](scripts/audit-daybook-and-finance.sql) to the rupee.
- [ ] Payments & Receipts page only shows `receipt` + `payment` vouchers (already done).
- [ ] [ledger-cheat-sheet.md](docs/ledger-cheat-sheet.md) matches what the UI actually shows for cases 1 through 9.
- [ ] `scripts/audit-daybook-and-finance.sql` Q1 returns zero rows after cleanup.

---

## 8. Open questions for the user

1. **Approval to delete** voucher `efaf594c-9513-48b8-9bc9-a9ecd7124d83` (the ₹34 crore phantom)? It is unquestionably broken (Dr ≠ Cr, cheque #999999, party "new suppliers") but it's your call.
2. **Please run** Q1, Q2, Q4 from [audit-daybook-and-finance.sql](scripts/audit-daybook-and-finance.sql) and paste the output — that tells me the exact size of the cleanup.
3. **Do you have a recent Supabase backup** before we run any DELETE? If not, we take one first (this is always the first step of data cleanup in production).

---

## 9. What ships in this PR

Only **section 4.1** (code changes). Nothing destructive. Nothing that touches the database. The plan for 4.2 is documented here so you can review and approve each DB step separately.
