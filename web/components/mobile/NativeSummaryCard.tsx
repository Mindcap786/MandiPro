"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { CountUpValue, CountUpCompactValue } from "./CountUpValue";

// ── Smart compact formatter ───────────────────────────────────────────────────
function formatCompact(raw: string): string {
    // strip ₹ and commas
    const clean = raw.replace(/[₹,]/g, '').trim();
    const num = parseFloat(clean);
    if (isNaN(num)) return raw; // non-numeric (e.g. lot count "120")
    if (num >= 10_000_000)  return `₹${(num / 10_000_000).toFixed(1).replace(/\.0$/, '')}Cr`;
    if (num >= 100_000)     return `₹${(num / 100_000).toFixed(1).replace(/\.0$/, '')}L`;
    if (num >= 1_000)       return `₹${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return raw; // small amounts — show as-is
}

/**
 * NativeSummaryCard — Dashboard hero card.
 * 
 * Full-width, green gradient, white text.
 * Row 1: Business name + date range pill
 * Row 2: Large total amount
 * Row 3: 3 sub-metrics in equal columns
 */

interface SubMetric {
    label: string;
    value: string;
    trend?: "up" | "down" | "flat";
}

interface NativeSummaryCardProps {
    businessName?: string;
    dateLabel?: string;
    totalLabel?: string;
    totalAmount: string;
    metrics: [SubMetric, SubMetric, SubMetric];
    className?: string;
}

export function NativeSummaryCard({
    businessName = "MandiGrow",
    dateLabel = "Last 7 days",
    totalLabel = "Total Revenue",
    totalAmount,
    metrics,
    className,
}: NativeSummaryCardProps) {
    return (
        <div className={cn(
            "w-full rounded-2xl p-5 mx-0",
            "bg-gradient-to-br from-[#1A6B3C] to-[#0f4d2b]",
            className
        )}>
            {/* Row 1 */}
            <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-white/80 font-medium">{businessName}</p>
                <span className="text-xs font-semibold text-white/70 bg-white/15 px-3 py-1 rounded-full">
                    {dateLabel}
                </span>
            </div>

            {/* Row 2 */}
            <div className="mb-1">
                <p className="text-xs text-white/60 uppercase tracking-widest font-medium mb-1">
                    {totalLabel}
                </p>
                <div className="flex items-baseline gap-2">
                    <CountUpValue 
                        value={parseFloat(totalAmount.replace(/[₹,]/g, '')) || 0}
                        prefix="₹"
                        className="text-4xl font-bold text-white tabular-nums tracking-tight"
                    />
                    {/* Trend Glow Capsule */}
                    <div className="bg-white/10 backdrop-blur-md border border-white/20 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                        <TrendingUp className="w-2.5 h-2.5 text-green-300" />
                        <span className="text-[10px] font-bold text-green-300">+12%</span>
                    </div>
                </div>
            </div>

            {/* Divider */}
            <div className="border-t border-white/15 my-4" />

            {/* Row 3 */}
            <div className="grid grid-cols-3 gap-0 divide-x divide-white/15">
                {metrics.map((metric, i) => {
                    const rawVal = parseFloat(metric.value.replace(/[₹,]/g, '')) || 0;
                    return (
                        <div key={i} className={cn("flex flex-col items-center text-center px-1", i > 0 && "pl-2")}>
                            <p className="text-[9px] text-white/60 uppercase tracking-wide font-medium mb-1 leading-tight truncate w-full text-center" title={metric.label}>
                                {metric.label}
                            </p>
                            <CountUpCompactValue 
                                value={rawVal}
                                className={cn(
                                    "font-bold text-white tabular-nums leading-tight",
                                    metric.value.length > 7 ? "text-sm" : "text-base"
                                )}
                            />
                            {metric.trend && (
                                <div className="mt-1">
                                    {metric.trend === "up" && (
                                        <div className="bg-green-500/20 px-1.5 py-0.5 rounded-md">
                                            <TrendingUp className="w-3 h-3 text-green-300" />
                                        </div>
                                    )}
                                    {metric.trend === "down" && (
                                        <div className="bg-red-500/20 px-1.5 py-0.5 rounded-md">
                                            <TrendingDown className="w-3 h-3 text-red-300" />
                                        </div>
                                    )}
                                    {metric.trend === "flat" && <Minus className="w-3 h-3 text-white/40" />}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── StatChip — small KPI chip for secondary metrics ───────────────────────────

interface StatChipProps {
    label: string;
    value: string;
    icon?: React.ReactNode;
    color?: string;
    className?: string;
    onPress?: () => void;
}

export function StatChip({ label, value, icon, color = "#1A6B3C", className, onPress }: StatChipProps) {
    const Tag = onPress ? "button" : "div";
    return (
        <Tag
            onClick={onPress}
            className={cn(
                "flex-1 bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)] min-w-0",
                "flex flex-col gap-1",
                onPress && "active:scale-95 transition-transform duration-150",
                className
            )}
        >
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280] truncate">
                    {label}
                </p>
                {icon && (
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${color}15` }}>
                        <span style={{ color }}>{icon}</span>
                    </div>
                )}
            </div>
            <p className="text-xl font-bold tabular-nums text-[#1A1A2E] truncate">{value}</p>
        </Tag>
    );
}
