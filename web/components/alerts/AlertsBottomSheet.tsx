"use client";

import { useStockAlerts } from "@/hooks/use-stock-alerts";
import { BottomSheet } from "@/components/mobile/BottomSheet";
import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, Clock, Package, AlertOctagon, AlertTriangle, Info, History as HistoryIcon, BellRing, Verified } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

function AlertCard({ alert, onResolve }: { alert: any, onResolve: (id: string) => void }) {
    let severityStyle = "bg-slate-50 border-slate-200 text-slate-700";
    let icon = <Info className="w-4 h-4" />;
    let iconBg = "bg-slate-100 text-slate-600";

    switch(alert.severity) {
        case 'emergency': 
            severityStyle = "bg-purple-50 border-purple-100 ring-1 ring-purple-200"; 
            icon = <AlertOctagon className="w-4 h-4" />;
            iconBg = "bg-purple-600 text-white";
            break;
        case 'critical': 
            severityStyle = "bg-red-50 border-red-100 ring-1 ring-red-200"; 
            icon = <AlertTriangle className="w-4 h-4" />;
            iconBg = "bg-red-600 text-white";
            break;
        case 'high': 
            severityStyle = "bg-orange-50 border-orange-100"; 
            icon = <Clock className="w-4 h-4" />;
            iconBg = "bg-orange-500 text-white";
            break;
        case 'medium': 
            severityStyle = "bg-amber-50 border-amber-100"; 
            icon = <Package className="w-4 h-4" />;
            iconBg = "bg-amber-500 text-white";
            break;
    }

    return (
        <motion.div 
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, x: -20 }}
            className={cn(
                "p-4 rounded-2xl mb-3 border shadow-sm transition-all relative overflow-hidden group bg-white",
                severityStyle,
                alert.is_resolved && "opacity-60 grayscale-[0.5]"
            )}
        >
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                    <div className={cn("p-1.5 rounded-lg shadow-sm", iconBg)}>
                        {icon}
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                        {alert.alert_type?.replace('_', ' ')}
                    </span>
                </div>
                {!alert.is_resolved && (
                    <div className="flex h-1.5 w-1.5 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                    </div>
                )}
            </div>
            
            <div className="space-y-1 mb-4">
                <h4 className="text-sm font-black text-slate-900 leading-tight">
                    {alert.commodity_name}
                    {alert.location_name && (
                        <span className="text-slate-400 font-bold ml-1.5">
                            @ {alert.location_name}
                        </span>
                    )}
                </h4>
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                    <span>{formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}</span>
                    <span>•</span>
                    <span className="text-slate-800">
                         {alert.current_value} / {alert.threshold_value} {alert.unit}
                    </span>
                </div>
            </div>

            <div className="flex gap-2 relative z-10">
                {!alert.is_resolved ? (
                    <button 
                        onClick={() => onResolve(alert.id)}
                        className="flex-1 bg-white border border-slate-200 hover:border-emerald-200 text-slate-700 h-10 rounded-xl text-xs font-black active:scale-95 transition-all flex justify-center items-center gap-2 shadow-sm"
                    >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Mark Resolved
                    </button>
                ) : (
                    <div className="flex-1 bg-slate-100/50 border border-slate-200/50 text-slate-400 h-10 rounded-xl text-xs font-black flex justify-center items-center gap-2">
                        <HistoryIcon className="w-3.5 h-3.5" />
                        Resolved
                    </div>
                )}
            </div>

            {/* Subtle background decoration */}
            <div className="absolute -right-4 -bottom-4 opacity-[0.03] rotate-12 group-hover:rotate-0 transition-transform duration-500 pointer-events-none">
                {icon}
            </div>
        </motion.div>
    );
}

export function AlertsBottomSheet({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
    const { alerts, resolveAlert, markAllSeen, markAllResolved } = useStockAlerts();
    const [filter, setFilter] = useState<'all' | 'critical' | 'active'>('active');

    // ── SENIOR ERP LOGIC: CLEAR BADGE ON OPEN ─────────────────────────────────
    useEffect(() => {
        if (isOpen) {
            markAllSeen();
        }
    }, [isOpen]);

    const activeCount = alerts.filter(a => !a.is_resolved).length;
    const criticalCount = alerts.filter(a => !a.is_resolved && (a.severity === 'critical' || a.severity === 'emergency')).length;

    const filteredAlerts = alerts.filter(a => {
        if (filter === 'active') return !a.is_resolved;
        if (filter === 'critical') return !a.is_resolved && (a.severity === 'critical' || a.severity === 'emergency');
        return true; // history/all
    });

    return (
        <BottomSheet 
            open={isOpen} 
            onClose={onClose} 
            title="Stock Alerts" 
            snap="full"
            headerAction={
                activeCount > 0 && (
                    <button 
                        onClick={() => markAllResolved()}
                        className="text-[10px] font-black uppercase tracking-widest text-[#1A6B3C] active:opacity-75 pr-2"
                    >
                        Dismiss All
                    </button>
                )
            }
        >
            <div className="flex flex-col h-full bg-[#F9FAFB]">
                {/* Custom Tab Switcher (Segmented Control style) */}
                <div className="px-5 py-4 sticky top-0 bg-[#F9FAFB] z-10 border-b border-gray-100">
                    <div className="flex p-1 bg-gray-200/50 rounded-2xl gap-1">
                        <button 
                            onClick={() => setFilter('active')}
                            className={cn(
                                "flex-1 py-2 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-2",
                                filter === 'active' ? "bg-white text-black shadow-sm" : "text-gray-500"
                            )}
                        >
                            Active
                            {activeCount > 0 && (
                                <span className={cn(
                                    "px-1.5 py-0.5 rounded-md text-[9px] font-black",
                                    filter === 'active' ? "bg-black text-white" : "bg-gray-300 text-gray-600"
                                )}>
                                    {activeCount}
                                </span>
                            )}
                        </button>
                        <button 
                            onClick={() => setFilter('critical')}
                            className={cn(
                                "flex-1 py-2 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-2",
                                filter === 'critical' ? "bg-white text-red-600 shadow-sm" : "text-gray-500"
                            )}
                        >
                            Critical
                            {criticalCount > 0 && (
                                <span className={cn(
                                    "px-1.5 py-0.5 rounded-md text-[9px] font-black",
                                    filter === 'critical' ? "bg-red-600 text-white" : "bg-red-100 text-red-600"
                                )}>
                                    {criticalCount}
                                </span>
                            )}
                        </button>
                        <button 
                            onClick={() => setFilter('all')}
                            className={cn(
                                "flex-1 py-2 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-2",
                                filter === 'all' ? "bg-white text-black shadow-sm" : "text-gray-500"
                            )}
                        >
                            History
                        </button>
                    </div>
                </div>

                {/* Alerts List */}
                <div className="flex-1 p-5 overflow-y-auto pb-10">
                    <AnimatePresence mode="popLayout">
                        {filteredAlerts.length === 0 ? (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.9 }} 
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex flex-col items-center justify-center h-[250px] text-center"
                            >
                                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                                    <Verified className="w-8 h-8 text-emerald-500" />
                                </div>
                                <h3 className="text-sm font-black text-slate-900 mb-1">Stock is Stable</h3>
                                <p className="text-[11px] font-bold text-slate-400 max-w-[180px] leading-relaxed">
                                    No {filter === 'critical' ? 'critical' : 'active'} alerts detected in your inventory.
                                </p>
                            </motion.div>
                        ) : (
                            <div className="space-y-1">
                                {filteredAlerts.map(alert => (
                                    <AlertCard key={alert.id} alert={alert} onResolve={resolveAlert} />
                                ))}
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </BottomSheet>
    );
}
