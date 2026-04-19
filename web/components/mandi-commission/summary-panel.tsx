"use client";

import React from "react";
import { TrendingUp, Users, IndianRupee, Percent } from "lucide-react";
import { MandiSessionFarmerRow } from "@/hooks/mandi/useMandiSession";

interface SummaryPanelProps {
    farmers: MandiSessionFarmerRow[];
    buyerLoadingCharges: number;
    buyerPackingCharges: number;
    hasBuyer: boolean;
    buyerName?: string;
}

export function SummaryPanel({
    farmers,
    buyerLoadingCharges,
    buyerPackingCharges,
    hasBuyer,
    buyerName,
}: SummaryPanelProps) {
    // Aggregates
    const totalQty = farmers.reduce((s, f) => s + (f.qty || 0), 0);
    const totalNetQty = farmers.reduce((s, f) => s + (f.netQty || 0), 0);
    const totalGross = farmers.reduce((s, f) => s + (f.grossAmount || 0), 0);
    const totalLess = farmers.reduce((s, f) => s + (f.lessAmount || 0), 0);
    const totalNet = farmers.reduce((s, f) => s + (f.netAmount || 0), 0);
    const totalCommission = farmers.reduce((s, f) => s + (f.commissionAmount || 0), 0);
    const totalLoading = farmers.reduce((s, f) => s + (f.loadingCharges || 0), 0);
    const totalOther = farmers.reduce((s, f) => s + (f.otherCharges || 0), 0);
    const totalFarmerPayable = farmers.reduce((s, f) => s + (f.netPayable || 0), 0);

    // Buyer calculation
    const buyerGross = farmers.reduce((s, f) => s + (f.grossAmount || 0), 0);
    const buyerLess = farmers.reduce((s, f) => s + (f.lessAmount || 0), 0);
    const buyerNet = farmers.reduce((s, f) => s + (f.netAmount || 0), 0);
    const buyerPayable = buyerNet + buyerLoadingCharges + buyerPackingCharges;

    // Mandi earnings
    const mandiEarnings = totalCommission + totalLoading + totalOther;

    const fmt = (v: number) =>
        "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
    const fmtQty = (v: number) =>
        v.toLocaleString("en-IN", { maximumFractionDigits: 2 });

    return (
        <div className="space-y-3">
            {/* Farmer Summary */}
            <div className="rounded-xl border border-slate-100 bg-slate-50 overflow-hidden">
                <div className="px-4 py-2 bg-slate-100 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                            Farmer Summary · {farmers.length} Row{farmers.length !== 1 ? "s" : ""}
                        </span>
                    </div>
                </div>
                <div className="p-3 space-y-1.5">
                    <SummaryLine label="Gross Amount" value={fmt(totalGross)} />
                    {totalLess > 0 && (
                        <SummaryLine label={`Less (Deduction)`} value={`− ${fmt(totalLess)}`} dim />
                    )}
                    <SummaryLine label="Net Amount" value={fmt(totalNet)} highlight />
                    <SummaryLine label="Commission" value={`− ${fmt(totalCommission)}`} dim />
                    {(totalLoading + totalOther) > 0 && (
                        <SummaryLine label="Charges" value={`− ${fmt(totalLoading + totalOther)}`} dim />
                    )}
                    <div className="border-t border-slate-200 pt-2 mt-1">
                        <SummaryLine
                            label="Total Payable to Farmers"
                            value={fmt(totalFarmerPayable)}
                            big
                        />
                    </div>
                </div>
            </div>

            {/* Buyer Summary */}
            {hasBuyer && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 overflow-hidden">
                    <div className="px-4 py-2 bg-blue-100 border-b border-blue-200">
                        <div className="flex items-center gap-2">
                            <IndianRupee className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-blue-700">
                                Buyer Bill · {buyerName || "Buyer"}
                            </span>
                        </div>
                    </div>
                    <div className="p-3 space-y-1.5">
                        <SummaryLine label="Gross Amount" value={fmt(buyerGross)} />
                        {buyerLess > 0 && (
                            <SummaryLine label="Less (Deduction)" value={`− ${fmt(buyerLess)}`} dim />
                        )}
                        <SummaryLine label="Net Amount" value={fmt(buyerNet)} highlight />
                        
                        {buyerLoadingCharges > 0 && (
                            <SummaryLine label="Loading Charges" value={`+ ${fmt(buyerLoadingCharges)}`} />
                        )}
                        {buyerPackingCharges > 0 && (
                            <SummaryLine label="Packing Charges" value={`+ ${fmt(buyerPackingCharges)}`} />
                        )}
                        <div className="border-t border-blue-200 pt-2 mt-1">
                            <SummaryLine label="Buyer Payable" value={fmt(buyerPayable)} big blue />
                        </div>
                    </div>
                </div>
            )}

            {/* Mandi Earnings */}
            <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 overflow-hidden">
                <div className="px-4 py-2 bg-emerald-100 border-b border-emerald-200">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                            Mandi Commission Income
                        </span>
                    </div>
                </div>
                <div className="p-3 space-y-1.5">
                    <SummaryLine label="Commission" value={fmt(totalCommission)} />
                    {(totalLoading + totalOther) > 0 && (
                        <SummaryLine label="Charges Recovered" value={fmt(totalLoading + totalOther)} />
                    )}
                    <div className="border-t border-emerald-200 pt-2 mt-1">
                        <SummaryLine label="Mandi Earns" value={fmt(mandiEarnings)} big green />
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────
interface SummaryLineProps {
    label: string;
    value: string;
    highlight?: boolean;
    big?: boolean;
    dim?: boolean;
    blue?: boolean;
    green?: boolean;
}

function SummaryLine({ label, value, highlight, big, dim, blue, green }: SummaryLineProps) {
    return (
        <div className="flex items-center justify-between">
            <span
                className={
                    big
                        ? "text-[11px] font-black uppercase tracking-wide text-slate-700"
                        : dim
                        ? "text-[10px] text-slate-400 font-medium"
                        : "text-[10px] text-slate-600 font-semibold"
                }
            >
                {label}
            </span>
            <span
                className={
                    big && green
                        ? "text-base font-black text-emerald-700"
                        : big && blue
                        ? "text-base font-black text-blue-700"
                        : big
                        ? "text-base font-black text-slate-900"
                        : highlight
                        ? "text-sm font-black text-slate-900"
                        : dim
                        ? "text-[10px] font-bold text-red-400"
                        : "text-[10px] font-bold text-slate-700"
                }
            >
                {value}
            </span>
        </div>
    );
}
