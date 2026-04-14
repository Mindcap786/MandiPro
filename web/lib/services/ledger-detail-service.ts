/**
 * Ledger Detail Service
 * Purpose: Format and process ledger entries with bill details
 *
 * Location: web/lib/services/ledger-detail-service.ts
 * Status: Production-ready, no dependencies on external APIs
 */

// Type definitions (assuming these exist in your types)
export interface LedgerEntry {
  id: string;
  entry_date: string;
  transaction_type: string;
  description: string;
  debit: number;
  credit: number;
  balance?: number;
  bill_number?: string;
  lot_items_json?: any;
  payment_against_bill_number?: string;
  contact_id?: string;
  reference_id?: string;
}

export interface ItemDetail {
  lot_id: string;
  item: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
}

export interface FormattedLedgerEntry extends LedgerEntry {
  billBadge?: string;
  itemDetails?: ItemDetail[];
  displayDescription?: string;
  itemSummary?: string;
}

/**
 * Parse JSON item details from ledger entry
 */
export function parseItemDetails(lotItemsJson: any): ItemDetail[] {
  if (!lotItemsJson?.items || !Array.isArray(lotItemsJson.items)) {
    return [];
  }

  return lotItemsJson.items.map((item: any) => ({
    lot_id: item.lot_id || '',
    item: item.item || 'Unknown Item',
    qty: Number(item.qty) || 0,
    unit: item.unit || 'unit',
    rate: Number(item.rate) || 0,
    amount: Number(item.amount) || 0,
  }));
}

/**
 * Format item detail for display
 * Example: "10 kg Rice @ 50"
 */
export function formatItemDetail(item: ItemDetail): string {
  return `${item.qty || 0} ${item.unit || 'unit'} ${item.item || 'Item'} @ ${item.rate || 0}`;
}

/**
 * Get item summary for ledger entry
 * Example: "Rice (10kg), Wheat (5kg)"
 */
export function getItemSummary(itemDetails: ItemDetail[]): string {
  if (!itemDetails || itemDetails.length === 0) {
    return '';
  }

  return itemDetails
    .map(item => `${item.item} (${item.qty}${item.unit})`)
    .join(', ');
}

/**
 * Format ledger entry for display with all details
 */
export function formatLedgerEntry(entry: LedgerEntry): FormattedLedgerEntry {
  const itemDetails = parseItemDetails(entry.lot_items_json);
  const itemSummary = getItemSummary(itemDetails);

  // Build enhanced description
  let displayDescription = entry.description || '';

  if (entry.bill_number) {
    // Replace generic "Sale Bill" with "Sale Bill #123"
    if (displayDescription.includes('Sale Bill #')) {
      // Already has bill number, add item summary if available
      if (itemSummary) {
        displayDescription = `${displayDescription} - ${itemSummary}`;
      }
    } else if (displayDescription.includes('Sale Bill')) {
      displayDescription = displayDescription.replace('Sale Bill', `Sale Bill ${entry.bill_number}`);
      if (itemSummary) {
        displayDescription = `${displayDescription} - ${itemSummary}`;
      }
    }
  }

  // Similar for purchase bills
  if (entry.bill_number?.startsWith('PURCHASE-')) {
    if (displayDescription.includes('Purchase Bill') && !displayDescription.includes(entry.bill_number)) {
      const billNum = entry.bill_number.replace('PURCHASE-', '');
      displayDescription = displayDescription.replace('Purchase Bill', `Purchase Bill ${billNum}`);
      if (itemSummary) {
        displayDescription = `${displayDescription} - ${itemSummary}`;
      }
    }
  }

  return {
    ...entry,
    billBadge: entry.bill_number ? entry.bill_number : undefined,
    itemDetails,
    displayDescription,
    itemSummary,
  };
}

/**
 * Format multiple ledger entries
 */
export function formatLedgerStatement(entries: LedgerEntry[]): FormattedLedgerEntry[] {
  return entries.map(entry => formatLedgerEntry(entry));
}

/**
 * Get detailed summary for a ledger entry (for tooltips/modals)
 */
export function getEntryDetailsSummary(entry: FormattedLedgerEntry): string {
  const lines = [
    `Type: ${entry.transaction_type}`,
    `Date: ${new Date(entry.entry_date).toLocaleDateString()}`,
  ];

  if (entry.billBadge) {
    lines.push(`Bill: ${entry.billBadge}`);
  }

  if (entry.payment_against_bill_number) {
    lines.push(`Payment Against: ${entry.payment_against_bill_number}`);
  }

  if (entry.itemDetails && entry.itemDetails.length > 0) {
    lines.push('Items:');
    entry.itemDetails.forEach(item => {
      lines.push(`  • ${formatItemDetail(item)} = ${item.amount}`);
    });
  }

  lines.push(`Debit: ${entry.debit}, Credit: ${entry.credit}`);
  if (entry.balance !== undefined) {
    lines.push(`Running Balance: ${entry.balance}`);
  }

  return lines.join('\n');
}

/**
 * Verify ledger entry balance (for validation)
 */
export function verifyEntryBalance(
  entry: LedgerEntry,
  expectedBalance: number
): boolean {
  const calculated = Number(entry.debit) - Number(entry.credit);
  const tolerance = 0.01; // 1 paisa tolerance
  return Math.abs(calculated - expectedBalance) < tolerance;
}

/**
 * Group ledger entries by bill for report display
 */
export function groupEntriesByBill(
  entries: FormattedLedgerEntry[]
): Map<string, FormattedLedgerEntry[]> {
  const grouped = new Map<string, FormattedLedgerEntry[]>();

  entries.forEach(entry => {
    const billKey = entry.billBadge || 'Unbilled';
    if (!grouped.has(billKey)) {
      grouped.set(billKey, []);
    }
    grouped.get(billKey)!.push(entry);
  });

  return grouped;
}

/**
 * Calculate bill-wise totals
 */
export function calculateBillTotals(entries: FormattedLedgerEntry[]) {
  const byBill = groupEntriesByBill(entries);
  const totals: Record<string, { debit: number; credit: number; balance: number }> = {};

  byBill.forEach((billEntries, billKey) => {
    let debit = 0;
    let credit = 0;
    let balance = 0;

    billEntries.forEach(entry => {
      debit += Number(entry.debit) || 0;
      credit += Number(entry.credit) || 0;
      balance = entry.balance || 0;
    });

    totals[billKey] = {
      debit: Math.round(debit * 100) / 100,
      credit: Math.round(credit * 100) / 100,
      balance: Math.round(balance * 100) / 100,
    };
  });

  return totals;
}

export default {
  parseItemDetails,
  formatItemDetail,
  getItemSummary,
  formatLedgerEntry,
  formatLedgerStatement,
  getEntryDetailsSummary,
  verifyEntryBalance,
  groupEntriesByBill,
  calculateBillTotals,
};
