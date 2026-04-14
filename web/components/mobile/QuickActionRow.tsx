"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
    FileInput, Truck, Users, ShoppingCart, Wallet,
    RotateCcw, Zap, Receipt, Package, BookOpen,
    Gavel, Scale, BarChart3, Tractor, QrCode,
} from "lucide-react";

/**
 * QuickActionRow — Horizontally scrollable quick action pills.
 * Shown on the Dashboard below NativeSummaryCard.
 * Covers every high-frequency action available on web.
 */

interface QuickAction {
    icon: React.ElementType;
    label: string;
    href: string;
    color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
    // Primary purchase / inward flow
    { icon: Gavel,        label: "Gate Entry", href: "/gate",                color: "#7C3AED" },
    { icon: Truck,        label: "Inward",     href: "/arrivals",            color: "#2563EB" },
    { icon: ShoppingCart, label: "Purchase",   href: "/purchase/bills",      color: "#D97706" },
    // Primary sales flow
    { icon: FileInput,    label: "New Sale",   href: "/sales/new",           color: "#1A6B3C" },
    { icon: Zap,          label: "Bulk Sale",  href: "/sales/new-invoice",   color: "#0891B2" },
    { icon: QrCode,       label: "POS",        href: "/sales/pos",           color: "#7C3AED" },
    { icon: RotateCcw,    label: "Returns",    href: "/sales/return/new",    color: "#DC2626" },
    // Finance & books
    { icon: Wallet,       label: "Payment",    href: "/finance/payments",    color: "#D97706" },
    { icon: BookOpen,     label: "Day Book",   href: "/reports/daybook",     color: "#6B7280" },
    // Reports
    { icon: BarChart3,    label: "Balance",    href: "/reports/balance-sheet", color: "#2563EB" },
    // Master data
    { icon: Package,      label: "Stock",      href: "/stock",               color: "#16A34A" },
    { icon: Users,        label: "Contacts",   href: "/contacts",            color: "#0891B2" },
];

interface QuickActionRowProps {
    actions?: QuickAction[];
    className?: string;
}

export function QuickActionRow({ actions = QUICK_ACTIONS, className }: QuickActionRowProps) {
    return (
        <div className={cn("space-y-2", className)}>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] px-0.5">
                Quick Actions
            </p>
            {/* Horizontally scrollable pill row */}
            <div className="-mx-4 px-4 flex gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-1">
                {actions.map((action) => (
                    <Link
                        key={action.href + action.label}
                        href={action.href}
                        prefetch={true}
                        className={cn(
                            "flex flex-col items-center gap-1.5 flex-shrink-0",
                            "min-w-[60px] active:scale-95 transition-transform duration-150"
                        )}
                    >
                        {/* Icon circle */}
                        <div
                            className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-[0_1px_4px_rgba(0,0,0,0.10)]"
                            style={{ backgroundColor: `${action.color}18` }}
                        >
                            <action.icon
                                className="w-6 h-6"
                                style={{ color: action.color }}
                                strokeWidth={2}
                            />
                        </div>
                        {/* Label */}
                        <span className="text-[10px] font-semibold text-[#6B7280] text-center leading-tight">
                            {action.label}
                        </span>
                    </Link>
                ))}
            </div>
        </div>
    );
}
