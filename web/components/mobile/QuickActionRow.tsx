"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
    FileInput, Truck, Users, ShoppingCart, Wallet,
    RotateCcw, Zap, BookOpen,
    Gavel, BarChart3, QrCode,
} from "lucide-react";
import { useLanguage } from "@/components/i18n/language-provider";

/**
 * QuickActionRow — Horizontally scrollable quick action pills.
 * Shown on the Dashboard below NativeSummaryCard.
 * Covers every high-frequency action available on web.
 */

interface QuickAction {
    icon: React.ElementType;
    tKey: string;
    href: string;
    color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
    // Primary purchase / inward flow
    { icon: Gavel,        tKey: "actions.gate_entry", href: "/gate",                color: "#7C3AED" },
    { icon: Truck,        tKey: "actions.inward",     href: "/arrivals",            color: "#2563EB" },
    { icon: ShoppingCart, tKey: "nav.purchase",       href: "/purchase/bills",      color: "#D97706" },
    // Primary sales flow
    { icon: FileInput,    tKey: "nav.sale_invoice",   href: "/sales/new",           color: "#1A6B3C" },
    { icon: Zap,          tKey: "nav.bulk_lot_sale",  href: "/sales/new-invoice",   color: "#0891B2" },
    { icon: QrCode,       tKey: "nav.pos",            href: "/sales/pos",           color: "#7C3AED" },
    { icon: RotateCcw,    tKey: "nav.returns",        href: "/sales/return/new",    color: "#DC2626" },
    // Finance & books
    { icon: Wallet,       tKey: "actions.payment",    href: "/finance/payments",    color: "#D97706" },
    { icon: BookOpen,     tKey: "nav.day_book",       href: "/reports/daybook",     color: "#6B7280" },
    // Reports
    { icon: BarChart3,    tKey: "nav.balance_sheet",  href: "/reports/balance-sheet", color: "#2563EB" },
    // Master data
    { icon: Users,        tKey: "nav.customers_vendors", href: "/contacts",         color: "#0891B2" },
];

interface QuickActionRowProps {
    className?: string;
}

export function QuickActionRow({ className }: QuickActionRowProps) {
    const { t } = useLanguage();

    return (
        <div className={cn("space-y-3", className)}>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 px-0.5">
                {t('nav.quick_actions')}
            </p>
            {/* Horizontally scrollable pill row */}
            <div className="-mx-4 px-4 flex gap-4 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-2">
                {QUICK_ACTIONS.map((action) => (
                    <Link
                        key={action.href + action.tKey}
                        href={action.href}
                        prefetch={true}
                        className={cn(
                            "flex flex-col items-center gap-2 flex-shrink-0",
                            "min-w-[64px] group active:scale-90 transition-all duration-200"
                        )}
                    >
                        {/* Icon circle */}
                        <div
                            className="w-14 h-14 rounded-[20px] flex items-center justify-center shadow-sm border border-white transition-all duration-300 group-hover:shadow-md"
                            style={{ backgroundColor: `${action.color}10` }}
                        >
                            <action.icon
                                className="w-6 h-6 transition-transform duration-300 group-hover:scale-110"
                                style={{ color: action.color }}
                                strokeWidth={2.5}
                            />
                        </div>
                        {/* Label */}
                        <span className="text-[10px] font-bold text-slate-500 text-center leading-tight transition-colors group-hover:text-slate-900">
                            {t(action.tKey)}
                        </span>
                    </Link>
                ))}
            </div>
        </div>
    );
}
