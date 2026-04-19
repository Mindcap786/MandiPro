"use client";

import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

/**
 * NativeCard — Primary card primitive for all list items.
 * 
 * Usage:
 *   <NativeCard>...</NativeCard>
 *   <NativeCard.Row label="Name" value="John" />
 */

interface NativeCardProps {
    children: React.ReactNode;
    className?: string;
    onPress?: () => void;
    /** Alias for onPress to support standard React event naming */
    onClick?: () => void;
    /** If true, adds divide-y between direct children */
    divided?: boolean;
    /** Pending: skeleton loading state */
    loading?: boolean;
}

export function NativeCard({ children, className, onPress, onClick, divided, loading }: NativeCardProps) {
    const activeHandler = onPress || onClick;
    const Tag = activeHandler ? "button" : "div";
    return (
        <Tag
            onClick={activeHandler}
            className={cn(
                "w-full bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.08)]",
                "overflow-hidden text-left",
                divided && "[&>*:not(:first-child)]:border-t [&>*:not(:first-child)]:border-[#E5E7EB]",
                onPress && "active:bg-gray-50 transition-colors duration-100 cursor-pointer",
                loading && "animate-pulse",
                className
            )}
        >
            {children}
        </Tag>
    );
}

// ── NativeCard.Row ──────────────────────────────────────────────────────────

interface RowProps {
    icon?: React.ReactNode;
    label: string;
    sublabel?: string;
    value?: React.ReactNode;
    showChevron?: boolean;
    onPress?: () => void;
    className?: string;
    /** Status dot color, eg. "#16A34A" */
    statusColor?: string;
    destructive?: boolean;
}

(NativeCard as any).Row = function NativeCardRow({
    icon,
    label,
    sublabel,
    value,
    showChevron = false,
    onPress,
    className,
    statusColor,
    destructive,
}: RowProps) {
    const Tag = onPress ? "button" : "div";
    return (
        <Tag
            onClick={onPress}
            className={cn(
                "w-full flex items-center gap-3 px-4 py-3.5 text-left",
                "active:bg-gray-50 transition-colors duration-100",
                onPress && "cursor-pointer",
                className
            )}
        >
            {statusColor && (
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor }} />
            )}
            {icon && (
                <div className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl bg-gray-50">
                    {icon}
                </div>
            )}
            <div className="flex-1 min-w-0">
                <p className={cn(
                    "text-sm font-semibold truncate",
                    destructive ? "text-[#DC2626]" : "text-[#1A1A2E]"
                )}>
                    {label}
                </p>
                {sublabel && (
                    <p className="text-xs text-[#6B7280] truncate mt-0.5">{sublabel}</p>
                )}
            </div>
            {value !== undefined && (
                <div className="text-sm text-[#6B7280] flex-shrink-0 ml-2">{value}</div>
            )}
            {showChevron && (
                <ChevronRight className="w-4 h-4 text-[#9CA3AF] flex-shrink-0 ml-1" />
            )}
        </Tag>
    );
};

(NativeCard as any).Row.displayName = "NativeCard.Row";
(NativeCard as any).displayName = "NativeCard";
