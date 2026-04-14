"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

/**
 * BottomSheet — replaces ALL Radix Dialog / modal usages on native.
 * 
 * Features:
 * - Slide from bottom with spring animation
 * - Drag handle at top
 * - Max-height 92dvh, scrollable
 * - Safe area inset bottom padding
 * - Backdrop blur overlay
 * - Optional sticky footer slot for submit buttons
 */

interface BottomSheetProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    /** Optional right action in header */
    headerAction?: React.ReactNode;
    children: React.ReactNode;
    /** Sticky button/footer at bottom of sheet */
    footer?: React.ReactNode;
    /** Allow scrolling content area */
    scrollable?: boolean;
    className?: string;
    /** Snap height: 'full' for nearly full screen, 'auto' for content-height */
    snap?: "full" | "auto";
}

export function BottomSheet({
    open,
    onClose,
    title,
    headerAction,
    children,
    footer,
    scrollable = true,
    className,
    snap = "auto",
}: BottomSheetProps) {
    // Prevent body scroll when sheet is open
    useEffect(() => {
        if (open) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => { document.body.style.overflow = ""; };
    }, [open]);

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        key="bottom-sheet-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-[2px]"
                    />

                    {/* Sheet */}
                    <motion.div
                        key="bottom-sheet-panel"
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 30, stiffness: 300 }}
                        className={cn(
                            "fixed bottom-0 left-0 right-0 z-[210]",
                            "bg-white rounded-t-3xl",
                            "shadow-[0_-8px_32px_rgba(0,0,0,0.18)]",
                            snap === "full" ? "max-h-[92dvh]" : "max-h-[92dvh]",
                            "flex flex-col",
                            className
                        )}
                        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
                    >
                        {/* Drag Handle */}
                        <div className="flex-shrink-0 flex justify-center pt-3 pb-1">
                            <div className="w-10 h-1 bg-gray-300 rounded-full" />
                        </div>

                        {/* Header */}
                        {(title || headerAction) && (
                            <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-[#E5E7EB]">
                                <h2 className="text-base font-bold text-[#1A1A2E] flex-1">
                                    {title}
                                </h2>
                                <div className="flex items-center gap-2">
                                    {headerAction}
                                    <button
                                        onClick={onClose}
                                        className="w-9 h-9 flex items-center justify-center rounded-full active:bg-gray-100 transition-colors"
                                        aria-label="Close"
                                    >
                                        <X className="w-5 h-5 text-[#6B7280]" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Scrollable Content */}
                        <div className={cn(
                            "flex-1",
                            scrollable && "overflow-y-auto overscroll-y-contain",
                            "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
                            "[-webkit-overflow-scrolling:touch]",
                        )}>
                            {children}
                        </div>

                        {/* Sticky Footer */}
                        {footer && (
                            <div className="flex-shrink-0 sticky bottom-0 bg-white border-t border-[#E5E7EB] px-5 pt-3 pb-2">
                                {footer}
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

// ── BottomSheetDestructive — for delete confirmations ──────────────────────

interface DestructiveSheetProps {
    open: boolean;
    onClose: () => void;
    title: string;
    description: React.ReactNode;
    confirmLabel?: string;
    onConfirm: () => void;
    loading?: boolean;
}

export function DestructiveBottomSheet({
    open,
    onClose,
    title,
    description,
    confirmLabel = "Delete",
    onConfirm,
    loading,
}: DestructiveSheetProps) {
    return (
        <BottomSheet open={open} onClose={onClose} title={title} snap="auto">
            <div className="px-5 py-4 space-y-4">
                <p className="text-sm text-[#6B7280] leading-relaxed">{description}</p>
                <div className="space-y-3">
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className={cn(
                            "w-full h-12 rounded-xl bg-[#DC2626] text-white text-sm font-semibold",
                            "active:scale-95 transition-transform duration-150",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                    >
                        {loading ? "Deleting..." : confirmLabel}
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full h-12 rounded-xl bg-white border border-[#E5E7EB] text-sm font-semibold text-[#1A1A2E] active:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </BottomSheet>
    );
}
