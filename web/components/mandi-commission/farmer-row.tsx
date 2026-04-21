"use client";

import React from "react";
import { Trash2 } from "lucide-react";
import { MandiSessionFarmerRow } from "@/hooks/mandi/useMandiSession";

interface AddedFarmerCardProps {
    index: number;
    row: MandiSessionFarmerRow;
    onDelete: (index: number) => void;
    onClick: () => void;
}

export function AddedFarmerCard({
    index,
    row,
    onDelete,
    onClick,
}: AddedFarmerCardProps) {
    const fmt = (v: number) =>
        "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 0 });

    return (
        <div 
            onClick={onClick}
            className="group relative flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-md hover:border-emerald-200 transition-all cursor-pointer"
        >
            <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-black">
                {index + 1}
            </div>
            
            <div className="flex-1 min-w-0">
                <div className="text-sm font-black text-slate-900 truncate">
                    {row.farmerName || "Unknown Farmer"}
                </div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate flex items-center gap-1.5">
                    <span className="text-emerald-600">{row.itemName || "Item"}</span>
                    <span className="text-slate-300 ml-1">•</span>
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{row.qty} {row.unit}</span>
                </div>
            </div>

            <div className="text-right pr-2">
                <div className="text-sm font-black text-emerald-700">
                    {fmt(row.netPayable || 0)}
                </div>
                <div className="text-[9px] font-bold text-slate-400">
                    Net Payable
                </div>
            </div>

            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete(index);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all bg-white shadow-sm border border-slate-100"
                title="Remove row"
            >
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
    );
}
