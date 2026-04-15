/**
 * Voucher integrity — shared pure helpers.
 *
 * Double-entry rule: for every voucher, Σ(debit) must equal Σ(credit).
 * Any voucher where this does not hold is a data bug that must be
 * quarantined from summary totals and flagged in the UI.
 *
 * These helpers are intentionally free of React, Supabase, and i18n so
 * they can be reused by the Day Book, Finance Dashboard, Payments &
 * Receipts page, and future audit views.
 */

export const VOUCHER_BALANCE_EPSILON = 0.01;

export interface LedgerLegLike {
    debit?: number | string | null;
    credit?: number | string | null;
}

const toNumber = (v: unknown): number => {
    const n = typeof v === 'number' ? v : Number(v || 0);
    return Number.isFinite(n) ? n : 0;
};

export const sumDebit = (legs: LedgerLegLike[]): number =>
    legs.reduce((sum, l) => sum + toNumber(l.debit), 0);

export const sumCredit = (legs: LedgerLegLike[]): number =>
    legs.reduce((sum, l) => sum + toNumber(l.credit), 0);

export const getVoucherImbalance = (legs: LedgerLegLike[]): number =>
    sumDebit(legs) - sumCredit(legs);

export const isVoucherBalanced = (legs: LedgerLegLike[]): boolean =>
    Math.abs(getVoucherImbalance(legs)) < VOUCHER_BALANCE_EPSILON;

/** A voucher that has fewer than 2 legs cannot possibly be a valid double-entry posting. */
export const isVoucherWellFormed = (legs: LedgerLegLike[]): boolean =>
    legs.length >= 2 && isVoucherBalanced(legs);

/**
 * Given a flat array of ledger entries tagged with voucher_id, group by
 * voucher_id and return the set of voucher IDs whose legs don't balance.
 * Entries without a voucher_id are ignored (they can't be attributed).
 */
export const findImbalancedVoucherIds = (
    entries: Array<LedgerLegLike & { voucher_id?: string | null }>
): Set<string> => {
    const byVoucher = new Map<string, LedgerLegLike[]>();
    for (const e of entries) {
        const vid = e.voucher_id ? String(e.voucher_id) : null;
        if (!vid) continue;
        if (!byVoucher.has(vid)) byVoucher.set(vid, []);
        byVoucher.get(vid)!.push(e);
    }

    const bad = new Set<string>();
    byVoucher.forEach((legs, vid) => {
        if (!isVoucherWellFormed(legs)) bad.add(vid);
    });
    return bad;
};

export interface VoucherHealthSummary {
    totalVouchers: number;
    imbalancedCount: number;
    imbalancedVoucherIds: string[];
    worstImbalance: number; // max |Dr − Cr| across broken vouchers
}

export const summarizeVoucherHealth = (
    entries: Array<LedgerLegLike & { voucher_id?: string | null }>
): VoucherHealthSummary => {
    const byVoucher = new Map<string, LedgerLegLike[]>();
    for (const e of entries) {
        const vid = e.voucher_id ? String(e.voucher_id) : null;
        if (!vid) continue;
        if (!byVoucher.has(vid)) byVoucher.set(vid, []);
        byVoucher.get(vid)!.push(e);
    }

    const bad: string[] = [];
    let worst = 0;
    byVoucher.forEach((legs, vid) => {
        if (!isVoucherWellFormed(legs)) {
            bad.push(vid);
            const delta = Math.abs(getVoucherImbalance(legs));
            if (delta > worst) worst = delta;
        }
    });

    return {
        totalVouchers: byVoucher.size,
        imbalancedCount: bad.length,
        imbalancedVoucherIds: bad,
        worstImbalance: worst,
    };
};
