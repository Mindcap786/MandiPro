/**
 * MandiGrow ERP - Core Accounting Logic
 * Centralized calculation functions for financial accuracy.
 */

export interface TransactionStats {
    total_amount?: number | string;
    market_fee?: number | string;
    nirashrit?: number | string;
    misc_fee?: number | string;
    loading_charges?: number | string;
    unloading_charges?: number | string;
    other_expenses?: number | string;
    gst_total?: number | string;
}

/**
 * Calculates the gross total revenue including all taxes and charges
 */
export function calculateGrossRevenue(data: TransactionStats[]): number {
    if (!data || data.length === 0) return 0;

    return data.reduce((sum, s) => {
        const total = Number(s.total_amount) || 0;
        const marketFee = Number(s.market_fee) || 0;
        const nirashrit = Number(s.nirashrit) || 0;
        const misc = Number(s.misc_fee) || 0;
        const loading = Number(s.loading_charges) || 0;
        const unloading = Number(s.unloading_charges) || 0;
        const other = Number(s.other_expenses) || 0;
        const gst = Number(s.gst_total) || 0;

        return sum + (total + marketFee + nirashrit + misc + loading + unloading + other + gst);
    }, 0);
}

/**
 * Formats currency values consistently for the Indian locale (₹)
 * Always shows 2 decimal places for audit accuracy.
 */
export function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

/**
 * Rounds a number to exactly 2 decimal places to prevent floating-point drift.
 * Standard used for all financial calculations in MandiGrow.
 */
export function roundTo2(num: number): number {
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates net amount for a sale item
 * Net = (Weight * Rate) - Discounts + Commissions
 */
export function calculateItemNetAmount(
    weight: number,
    rate: number,
    commissionPercent: number = 0,
    discounts: number = 0
): number {
    const baseValue = roundTo2(Number(weight) * Number(rate));
    const commissionValue = roundTo2((baseValue * Number(commissionPercent)) / 100);
    return roundTo2(baseValue + commissionValue - Number(discounts));
}
