"use client";

import { cn } from "@/lib/utils";
import { BottomSheet } from "./BottomSheet";

/**
 * ActionSheet — replaces ALL dropdown menus, <select> pickers, and Popover menus.
 * 
 * Opens as a bottom sheet with a list of native-feeling tall rows.
 * Each option: h-14, icon optional, text-base, active:bg-gray-50
 * Destructive option: text-[#DC2626]
 * Cancel: separate rounded button below gap
 */

export interface ActionSheetOption {
    label: string;
    icon?: React.ReactNode;
    value?: string;
    destructive?: boolean;
    disabled?: boolean;
    /** Custom JSX after label */
    badge?: React.ReactNode;
}

interface ActionSheetProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    options: ActionSheetOption[];
    onSelect: (option: ActionSheetOption) => void;
    selectedValue?: string;
}

export function ActionSheet({
    open,
    onClose,
    title,
    options,
    onSelect,
    selectedValue,
}: ActionSheetProps) {
    const handleSelect = (option: ActionSheetOption) => {
        if (option.disabled) return;
        onSelect(option);
        onClose();
    };

    return (
        <BottomSheet open={open} onClose={onClose} title={title} snap="auto" scrollable={false}>
            <div className="px-0 pb-0">
                {/* Options List */}
                <div className="divide-y divide-[#F3F4F6]">
                    {options.map((option, i) => {
                        const isSelected = option.value === selectedValue;
                        return (
                            <button
                                key={`${option.value ?? option.label}-${i}`}
                                onClick={() => handleSelect(option)}
                                disabled={option.disabled}
                                className={cn(
                                    "w-full h-14 flex items-center gap-3 px-5 text-left",
                                    "active:bg-gray-50 transition-colors duration-100",
                                    "disabled:opacity-40 disabled:cursor-not-allowed",
                                    isSelected && "bg-[#F0FDF4]",
                                )}
                            >
                                {option.icon && (
                                    <span className={cn(
                                        "flex-shrink-0",
                                        option.destructive ? "text-[#DC2626]" : isSelected ? "text-[#1A6B3C]" : "text-[#6B7280]"
                                    )}>
                                        {option.icon}
                                    </span>
                                )}
                                <span className={cn(
                                    "flex-1 text-base font-medium",
                                    option.destructive ? "text-[#DC2626]" : isSelected ? "text-[#1A6B3C] font-semibold" : "text-[#1A1A2E]"
                                )}>
                                    {option.label}
                                </span>
                                {option.badge && <span className="flex-shrink-0">{option.badge}</span>}
                                {isSelected && (
                                    <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                                        <svg viewBox="0 0 20 20" fill="#1A6B3C" className="w-5 h-5">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Cancel button */}
                <div className="p-4 pt-3">
                    <button
                        onClick={onClose}
                        className={cn(
                            "w-full h-14 rounded-2xl bg-white border border-[#E5E7EB]",
                            "text-base font-semibold text-[#1A1A2E]",
                            "active:bg-gray-50 transition-colors duration-100"
                        )}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </BottomSheet>
    );
}

// ── useActionSheet hook — convenience wrapper ─────────────────────────────────

import { useState } from "react";

export function useActionSheet() {
    const [state, setState] = useState<{
        open: boolean;
        options: ActionSheetOption[];
        title?: string;
        selectedValue?: string;
        resolve?: (option: ActionSheetOption | null) => void;
    }>({ open: false, options: [] });

    const show = (opts: Omit<typeof state, "open" | "resolve">): Promise<ActionSheetOption | null> => {
        return new Promise((resolve) => {
            setState({ ...opts, open: true, resolve });
        });
    };

    const close = () => {
        state.resolve?.(null);
        setState(s => ({ ...s, open: false }));
    };

    const select = (option: ActionSheetOption) => {
        state.resolve?.(option);
        setState(s => ({ ...s, open: false }));
    };

    const Sheet = (
        <ActionSheet
            open={state.open}
            onClose={close}
            title={state.title}
            options={state.options}
            onSelect={select}
            selectedValue={state.selectedValue}
        />
    );

    return { show, Sheet };
}
