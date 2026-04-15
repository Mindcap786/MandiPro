/**
 * packages/domain/src/finance/ledger-engine.ts
 *
 * Double-entry accounting helpers — pure domain logic.
 * Used by report generators on web and mobile.
 */

export type DrCr = 'Dr' | 'Cr'

export interface LedgerRow {
  debit: number | null
  credit: number | null
}

/**
 * Compute running balance for an array of ledger rows, starting from openingBalance.
 * Convention: positive balance = Debit (party owes us), negative = Credit (we owe party).
 */
export function computeRunningBalances(rows: LedgerRow[], openingBalance: number): number[] {
  let balance = openingBalance
  return rows.map(row => {
    balance += (Number(row.debit ?? 0) - Number(row.credit ?? 0))
    return round2(balance)
  })
}

/**
 * Format a balance with Dr/Cr suffix.
 */
export function formatBalance(amount: number): { value: number; suffix: DrCr; absolute: number } {
  return {
    value: amount,
    absolute: Math.abs(amount),
    suffix: amount >= 0 ? 'Dr' : 'Cr',
  }
}

/**
 * Compute day book totals from a set of ledger entries.
 */
export function computeDayBookTotals(rows: LedgerRow[]): {
  total_debit: number
  total_credit: number
  net: number
  net_suffix: DrCr
} {
  const total_debit = round2(rows.reduce((s, r) => s + Number(r.debit ?? 0), 0))
  const total_credit = round2(rows.reduce((s, r) => s + Number(r.credit ?? 0), 0))
  const net = round2(total_debit - total_credit)
  return { total_debit, total_credit, net, net_suffix: net >= 0 ? 'Dr' : 'Cr' }
}

/**
 * Group ledger entries by date for day-book display.
 */
export function groupByDate<T extends { entry_date: string }>(
  rows: T[]
): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const date = row.entry_date.slice(0, 10) // YYYY-MM-DD
    const existing = map.get(date) ?? []
    existing.push(row)
    map.set(date, existing)
  }
  return map
}

/** Round to 2 decimal places */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
