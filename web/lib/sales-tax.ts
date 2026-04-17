import { roundTo2 } from "./accounting-logic";

export type SaleTaxSettings = {
    market_fee_percent?: number | string | null;
    nirashrit_percent?: number | string | null;
    misc_fee_percent?: number | string | null;
    gst_enabled?: boolean | null;
    gst_type?: string | null;
    cgst_percent?: number | string | null;
    sgst_percent?: number | string | null;
    igst_percent?: number | string | null;
};

export type SaleTaxableItem = {
    amount?: number | string | null;
    gst_rate?: number | string | null;
    is_gst_exempt?: boolean | null;
};

const toNumber = (value: number | string | null | undefined) => Number(value) || 0;

const resolveIsIgst = (
    taxSettings: SaleTaxSettings,
    orgStateCode?: string | null,
    buyerStateCode?: string | null
) => {
    if (taxSettings.gst_enabled) {
        if (taxSettings.gst_type === "inter") return true;
        if (taxSettings.gst_type === "intra") return false;
    }

    return !!orgStateCode && !!buyerStateCode && orgStateCode !== buyerStateCode;
};

export function calculateSaleItemTaxBreakdown({
    amount,
    gstRate,
    isGstExempt,
    taxSettings,
    orgStateCode,
    buyerStateCode,
}: {
    amount?: number | string | null;
    gstRate?: number | string | null;
    isGstExempt?: boolean | null;
    taxSettings: SaleTaxSettings;
    orgStateCode?: string | null;
    buyerStateCode?: string | null;
}) {
    const taxableAmount = toNumber(amount);
    const isIgst = resolveIsIgst(taxSettings, orgStateCode, buyerStateCode);

    if (taxableAmount <= 0 || isGstExempt) {
        return {
            isIgst,
            gstRateApplied: 0,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 0,
            gstTotal: 0,
        };
    }

    const effectiveGstRate = taxSettings.gst_enabled
        ? (isIgst
            ? toNumber(taxSettings.igst_percent)
            : toNumber(taxSettings.cgst_percent) + toNumber(taxSettings.sgst_percent))
        : toNumber(gstRate);

    const gstRaw = taxableAmount * (effectiveGstRate / 100);
    const cgstRaw = isIgst ? 0 : gstRaw / 2;
    const sgstRaw = isIgst ? 0 : gstRaw / 2;
    const igstRaw = isIgst ? gstRaw : 0;

    const cgstAmount = roundTo2(cgstRaw);
    const sgstAmount = roundTo2(sgstRaw);
    const igstAmount = roundTo2(igstRaw);

    return {
        isIgst,
        gstRateApplied: effectiveGstRate,
        cgstAmount,
        sgstAmount,
        igstAmount,
        gstTotal: cgstAmount + sgstAmount + igstAmount,
    };
}

export function calculateSaleTotals({
    items,
    taxSettings,
    orgStateCode,
    buyerStateCode,
    loadingCharges = 0,
    unloadingCharges = 0,
    otherExpenses = 0,
    discountAmount = 0,
}: {
    items: SaleTaxableItem[];
    taxSettings: SaleTaxSettings;
    orgStateCode?: string | null;
    buyerStateCode?: string | null;
    loadingCharges?: number | string | null;
    unloadingCharges?: number | string | null;
    otherExpenses?: number | string | null;
    discountAmount?: number | string | null;
}) {
    const subTotal = items.reduce((sum, item) => sum + toNumber(item.amount), 0);
    const safeDiscountAmount = Math.min(toNumber(discountAmount), subTotal);
    const taxableSubTotal = subTotal - safeDiscountAmount;

    // Fees calculated on taxable subtotal (post-discount)
    const marketFee = roundTo2(taxableSubTotal * (toNumber(taxSettings.market_fee_percent) / 100));
    const nirashrit = roundTo2(taxableSubTotal * (toNumber(taxSettings.nirashrit_percent) / 100));
    const miscFee = roundTo2(taxableSubTotal * (toNumber(taxSettings.misc_fee_percent) / 100));

    // Calculate GST proportionally based on the discounted ratio of total amount
    const discountRatio = subTotal > 0 ? taxableSubTotal / subTotal : 0;
    
    const taxBreakdowns = items.map((item) =>
        calculateSaleItemTaxBreakdown({
            amount: toNumber(item.amount) * discountRatio, // apply proportional discount on item level
            gstRate: item.gst_rate,
            isGstExempt: item.is_gst_exempt,
            taxSettings,
            orgStateCode,
            buyerStateCode,
        })
    );

    const cgstAmount = taxBreakdowns.reduce((sum, item) => sum + item.cgstAmount, 0);
    const sgstAmount = taxBreakdowns.reduce((sum, item) => sum + item.sgstAmount, 0);
    const igstAmount = taxBreakdowns.reduce((sum, item) => sum + item.igstAmount, 0);
    const gstTotal = cgstAmount + sgstAmount + igstAmount;
    const isIgst = taxBreakdowns[0]?.isIgst ?? resolveIsIgst(taxSettings, orgStateCode, buyerStateCode);

    const extraCharges =
        toNumber(loadingCharges) + toNumber(unloadingCharges) + toNumber(otherExpenses);

    // Grand Total is traditionally rounded to the nearest integer in India, 
    // but the sub-components MUST be 2-decimal precise.
    const grandTotal = Math.round(
        taxableSubTotal + marketFee + nirashrit + miscFee + gstTotal + extraCharges
    );

    return {
        subTotal, // Raw subtotal before discount
        discountAmount: safeDiscountAmount,
        marketFee,
        nirashrit,
        miscFee,
        cgstAmount,
        sgstAmount,
        igstAmount,
        gstTotal,
        extraCharges,
        loadingCharges: toNumber(loadingCharges),
        unloadingCharges: toNumber(unloadingCharges),
        otherExpenses: toNumber(otherExpenses),
        grandTotal,
        isIgst,
    };
}
