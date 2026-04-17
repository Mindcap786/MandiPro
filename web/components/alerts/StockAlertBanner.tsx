"use client";

import { useStockAlerts } from "@/hooks/use-stock-alerts";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { useState } from "react";
import { AlertsBottomSheet } from "./AlertsBottomSheet";

export function StockAlertBanner({ commodityId, commodityName }: { commodityId: string, commodityName: string }) {
    const { alerts } = useStockAlerts();
    const [sheetOpen, setSheetOpen] = useState(false);
    
    // Find active alerts specifically for this commodity
    const activeAlerts = alerts.filter(a => !a.is_resolved && a.commodity_id === commodityId);
    
    if (activeAlerts.length === 0) return null;

    const hasCritical = activeAlerts.some(a => a.severity === 'critical' || a.severity === 'emergency');

    let bgClass = "bg-amber-50 border-amber-200 text-amber-800";
    let iconClass = "text-amber-600";
    
    if (hasCritical) {
        bgClass = "bg-red-50 border-red-200 text-red-800";
        iconClass = "text-red-600";
    }

    return (
        <>
            <button 
                onClick={() => setSheetOpen(true)}
                className={`w-full flex items-center justify-between p-3 rounded-xl border ${bgClass} shadow-sm mb-3 active:opacity-80 transition-opacity`}
            >
                <div className="flex items-center gap-3">
                    <AlertTriangle className={`w-5 h-5 ${iconClass} flex-shrink-0`} />
                    <div className="text-left">
                        <p className="text-[13px] font-black uppercase tracking-wide">
                            {activeAlerts.length} Active Alert{activeAlerts.length > 1 ? 's' : ''} for {commodityName}
                        </p>
                        <p className="text-[11px] font-bold opacity-80 mt-0.5">
                            Tap to view and resolve issues
                        </p>
                    </div>
                </div>
                <ChevronRight className={`w-5 h-5 ${iconClass} opacity-50`} />
            </button>

            {/* We can reuse the bottom sheet, but it will show ALL alerts unless modified to filter by commodity. 
                For MVP, showing the unified bottom sheet is fine, or we filter. The bottom sheet component filters locally.
                We will let it open the global AlertsBottomSheet, the user can easily see their specific alerts at the top. */}
            <AlertsBottomSheet 
                isOpen={sheetOpen} 
                onClose={() => setSheetOpen(false)} 
            />
        </>
    );
}
