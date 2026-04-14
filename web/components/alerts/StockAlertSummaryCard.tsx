"use client";

import { useStockAlerts } from "@/hooks/use-stock-alerts";
import { ArrowRight, AlertOctagon } from "lucide-react";
import { useState } from "react";
import { AlertsBottomSheet } from "./AlertsBottomSheet";

export function StockAlertSummaryCard() {
    const { alerts } = useStockAlerts();
    const [sheetOpen, setSheetOpen] = useState(false);

    const criticalAlerts = alerts.filter(a => !a.is_resolved && (a.severity === 'critical' || a.severity === 'emergency'));

    if (criticalAlerts.length === 0) return null;

    // Get unique commodity names failing critically
    const failingCommodities = Array.from(new Set(criticalAlerts.map(a => a.commodity_name))).join(', ');

    return (
        <>
            <div 
                onClick={() => setSheetOpen(true)}
                className="bg-red-50 border border-red-200 rounded-2xl p-4 shadow-sm mb-6 cursor-pointer active:scale-[0.98] transition-transform"
            >
                <div className="flex items-center gap-3 mb-2">
                    <AlertOctagon className="w-6 h-6 text-red-600" />
                    <h3 className="text-[14px] font-[1000] text-red-900 tracking-tight uppercase">
                        {criticalAlerts.length} Critical Stock Alert{criticalAlerts.length > 1 ? 's' : ''}
                    </h3>
                </div>
                
                <p className="text-[13px] font-bold text-red-800 ml-9 mb-3">
                    {failingCommodities} need{criticalAlerts.length === 1 ? 's' : ''} immediate action
                </p>

                <div className="flex justify-end">
                    <button className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-red-700 bg-red-100 px-3 py-1.5 rounded-lg active:bg-red-200">
                        View All Alerts <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            <AlertsBottomSheet 
                isOpen={sheetOpen} 
                onClose={() => setSheetOpen(false)} 
            />
        </>
    );
}
