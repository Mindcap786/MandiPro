import { describe, expect, it } from "vitest";
import { calculateSaleItemTaxBreakdown, calculateSaleTotals } from "./sales-tax";

describe("sales-tax helpers", () => {
    it("uses enabled GST settings for intra-state totals", () => {
        const totals = calculateSaleTotals({
            items: [{ amount: 1000, gst_rate: 5 }],
            taxSettings: {
                market_fee_percent: 1,
                nirashrit_percent: 0.5,
                misc_fee_percent: 0.5,
                gst_enabled: true,
                gst_type: "intra",
                cgst_percent: 6,
                sgst_percent: 6,
                igst_percent: 12,
            },
            loadingCharges: 20,
            unloadingCharges: 10,
            otherExpenses: 5,
        });

        expect(totals.cgstAmount).toBe(60);
        expect(totals.sgstAmount).toBe(60);
        expect(totals.igstAmount).toBe(0);
        expect(totals.gstTotal).toBe(120);
        expect(totals.grandTotal).toBe(1175);
    });

    it("falls back to item GST rate and detects inter-state IGST", () => {
        const breakdown = calculateSaleItemTaxBreakdown({
            amount: 2000,
            gstRate: 5,
            isGstExempt: false,
            taxSettings: {
                gst_enabled: false,
            },
            orgStateCode: "KA",
            buyerStateCode: "TN",
        });

        expect(breakdown.isIgst).toBe(true);
        expect(breakdown.igstAmount).toBe(100);
        expect(breakdown.cgstAmount).toBe(0);
        expect(breakdown.sgstAmount).toBe(0);
    });

    it("skips GST for exempt items even when GST settings are enabled", () => {
        const breakdown = calculateSaleItemTaxBreakdown({
            amount: 1500,
            gstRate: 12,
            isGstExempt: true,
            taxSettings: {
                gst_enabled: true,
                gst_type: "intra",
                cgst_percent: 9,
                sgst_percent: 9,
            },
        });

        expect(breakdown.gstTotal).toBe(0);
    });
});
