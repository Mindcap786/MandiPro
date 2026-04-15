"use client";

import { cn } from "@/lib/utils";
import { useRef, useEffect, useState } from "react";

/**
 * SegmentedControl — replaces all Radix Tabs and top-of-page tab rows.
 * 
 * Horizontal pill row, horizontally scrollable if many items.
 * Active: bg-[#1A6B3C] text-white
 * Inactive: bg-white text-[#6B7280] border border-[#E5E7EB]
 */

interface SegmentedOption {
    label: string;
    value: string;
    count?: number;
    icon?: React.ReactNode;
}

interface SegmentedControlProps {
    options: SegmentedOption[];
    value: string;
    onChange: (value: string) => void;
    className?: string;
    /** Full-width equal columns (not scrollable) */
    stretch?: boolean;
}

export function SegmentedControl({ options, value, onChange, className, stretch }: SegmentedControlProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll active pill into view
    useEffect(() => {
        const activeIdx = options.findIndex(o => o.value === value);
        if (activeIdx < 0 || !scrollRef.current) return;
        const pill = scrollRef.current.children[activeIdx] as HTMLElement;
        if (pill) {
            pill.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
    }, [value, options]);

    return (
        <div
            ref={scrollRef}
            className={cn(
                "flex gap-2 py-2",
                stretch ? "px-0" : "overflow-x-auto px-4",
                "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
                className
            )}
        >
            {options.map((option) => {
                const isActive = option.value === value;
                return (
                    <button
                        key={option.value}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium",
                            "transition-colors duration-200 whitespace-nowrap flex-shrink-0",
                            "active:scale-95 transition-transform",
                            stretch && "flex-1 justify-center",
                            isActive
                                ? "bg-[#1A6B3C] text-white"
                                : "bg-white text-[#6B7280] border border-[#E5E7EB]"
                        )}
                    >
                        {option.icon && <span className="w-4 h-4">{option.icon}</span>}
                        {option.label}
                        {option.count !== undefined && (
                            <span className={cn(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center",
                                isActive ? "bg-white/20 text-white" : "bg-[#F3F4F6] text-[#9CA3AF]"
                            )}>
                                {option.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

// ── TabSegmented — for classic iOS-style equal-width tabs ──────────────────

interface TabOption {
    label: string;
    value: string;
}
interface TabSegmentedProps {
    tabs: TabOption[];
    value: string;
    onChange: (value: string) => void;
    className?: string;
}

export function TabSegmented({ tabs, value, onChange, className }: TabSegmentedProps) {
    return (
        <div className={cn("flex bg-[#F1F3F5] rounded-xl p-1", className)}>
            {tabs.map((tab) => {
                const isActive = tab.value === value;
                return (
                    <button
                        key={tab.value}
                        onClick={() => onChange(tab.value)}
                        className={cn(
                            "flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200",
                            "active:scale-95",
                            isActive
                                ? "bg-white text-[#1A1A2E] shadow-[0_1px_3px_rgba(0,0,0,0.10)]"
                                : "text-[#6B7280]"
                        )}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}
