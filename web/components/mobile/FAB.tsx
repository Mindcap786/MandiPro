"use client";

import { useState } from "react";
import { Plus, X, FileInput, Truck, Users, ShoppingCart, Wallet } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/i18n/language-provider";
import { motion, AnimatePresence } from "framer-motion";

interface SpeedDialAction {
    icon: React.ElementType;
    tKey: string;
    href: string;
    color?: string;
}

const SPEED_DIAL_ACTIONS: SpeedDialAction[] = [
    { icon: FileInput,    tKey: "actions.new_sale",     href: "/sales/new",         color: "#16A34A" },
    { icon: Truck,        tKey: "actions.new_arrival",  href: "/arrivals",          color: "#1A6B3C" },
    { icon: Users,        tKey: "actions.add_contact",  href: "/contacts",          color: "#2563EB" },
    { icon: ShoppingCart, tKey: "actions.quick_entry",  href: "/stock/quick-entry", color: "#7C3AED" },
    { icon: Wallet,       tKey: "actions.add_payment",  href: "/finance/payments",  color: "#D97706" },
];

export function FAB() {
    const [open, setOpen] = useState(false);
    const { t } = useLanguage();

    return (
        <>
            {/* Backdrop */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        key="fab-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setOpen(false)}
                        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
                    />
                )}
            </AnimatePresence>
            
            {/* Speed Dial Actions */}
            <AnimatePresence>
                {open && (
                    <div className="fixed bottom-[88px] right-4 z-50 flex flex-col-reverse items-end gap-3">
                        {SPEED_DIAL_ACTIONS.map((action, i) => (
                            <motion.div
                                key={action.href}
                                initial={{ opacity: 0, y: 20, scale: 0.8 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 20, scale: 0.8 }}
                                transition={{ delay: i * 0.05, type: "spring", stiffness: 400, damping: 25 }}
                            >
                                <Link
                                    href={action.href}
                                    onClick={() => setOpen(false)}
                                    className="flex items-center gap-3 active:scale-95 transition-transform duration-150"
                                >
                                    {/* Label pill */}
                                    <span className="bg-[#1A1A2E] text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg">
                                        {t(action.tKey)}
                                    </span>
                                    {/* Icon circle */}
                                    <div
                                        className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg"
                                        style={{ backgroundColor: action.color }}
                                    >
                                        <action.icon className="w-5 h-5 text-white" strokeWidth={2} />
                                    </div>
                                </Link>
                            </motion.div>
                        ))}
                    </div>
                )}
            </AnimatePresence>

            {/* Main FAB Button */}
            <button
                onClick={() => setOpen(!open)}
                className={cn(
                    "fixed bottom-[88px] right-4 z-50",
                    "w-14 h-14 rounded-full bg-[#F97316]",
                    "shadow-[0_4px_16px_rgba(249,115,22,0.45)]",
                    "flex items-center justify-center",
                    "active:scale-90 transition-all duration-150 ease-out",
                    open && "rotate-45"
                )}
                style={{ 
                    bottom: "calc(72px + env(safe-area-inset-bottom) + 16px)",
                    right: "16px",
                }}
                aria-label={open ? "Close actions" : "Quick actions"}
            >
                {open ? (
                    <X className="w-7 h-7 text-white" strokeWidth={2.5} />
                ) : (
                    <Plus className="w-7 h-7 text-white" strokeWidth={2.5} />
                )}
            </button>
        </>
    );
}
