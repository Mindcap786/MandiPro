"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * NativeInput
 * 
 * Label-above input pattern. Every input in the app MUST use this.
 * - h-12 minimum → prevents iOS auto-zoom (text-base = 16px)
 * - label always above the field
 * - rounded-xl, focus ring green
 * - error slot preserved
 */

interface NativeInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    required?: boolean;
    error?: string;
    hint?: string;
    containerClassName?: string;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
}

export const NativeInput = forwardRef<HTMLInputElement, NativeInputProps>(
    ({ label, required, error, hint, containerClassName, leftIcon, rightIcon, className, ...props }, ref) => {
        return (
            <div className={cn("space-y-1.5", containerClassName)}>
                {label && (
                    <label className="text-sm font-medium text-[#1A1A2E] block">
                        {label}
                        {required && <span className="text-[#DC2626] ml-0.5">*</span>}
                    </label>
                )}
                <div className="relative">
                    {leftIcon && (
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]">
                            {leftIcon}
                        </div>
                    )}
                    <input
                        ref={ref}
                        className={cn(
                            "w-full h-12 rounded-xl bg-white",
                            "border border-[#E5E7EB] text-base text-[#1A1A2E]",
                            "placeholder:text-[#9CA3AF]",
                            "focus:outline-none focus:ring-2 focus:ring-[#1A6B3C]",
                            "focus:border-transparent transition-all duration-150",
                            leftIcon ? "pl-10 pr-4" : "px-4",
                            rightIcon ? "pr-10" : "",
                            error && "border-[#DC2626] focus:ring-[#DC2626]",
                            props.disabled && "bg-gray-50 text-[#9CA3AF] cursor-not-allowed",
                            className
                        )}
                        {...props}
                    />
                    {rightIcon && (
                        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]">
                            {rightIcon}
                        </div>
                    )}
                </div>
                {hint && !error && (
                    <p className="text-xs text-[#6B7280] px-0.5">{hint}</p>
                )}
                {error && (
                    <p className="text-xs text-[#DC2626] px-0.5 font-medium">{error}</p>
                )}
            </div>
        );
    }
);
NativeInput.displayName = "NativeInput";

// ── NativeTextarea ────────────────────────────────────────────────────────────

interface NativeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    required?: boolean;
    error?: string;
    containerClassName?: string;
}

export const NativeTextarea = forwardRef<HTMLTextAreaElement, NativeTextareaProps>(
    ({ label, required, error, containerClassName, className, ...props }, ref) => {
        return (
            <div className={cn("space-y-1.5", containerClassName)}>
                {label && (
                    <label className="text-sm font-medium text-[#1A1A2E] block">
                        {label}
                        {required && <span className="text-[#DC2626] ml-0.5">*</span>}
                    </label>
                )}
                <textarea
                    ref={ref}
                    className={cn(
                        "w-full min-h-[96px] rounded-xl bg-white px-4 py-3",
                        "border border-[#E5E7EB] text-base text-[#1A1A2E]",
                        "placeholder:text-[#9CA3AF]",
                        "focus:outline-none focus:ring-2 focus:ring-[#1A6B3C]",
                        "focus:border-transparent transition-all duration-150 resize-none",
                        error && "border-[#DC2626] focus:ring-[#DC2626]",
                        className
                    )}
                    {...props}
                />
                {error && (
                    <p className="text-xs text-[#DC2626] px-0.5 font-medium">{error}</p>
                )}
            </div>
        );
    }
);
NativeTextarea.displayName = "NativeTextarea";

// ── NativeSectionLabel ────────────────────────────────────────────────────────

export function NativeSectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <p className={cn(
            "text-xs font-semibold uppercase tracking-widest text-[#6B7280] mt-4 mb-2 pl-0.5",
            className
        )}>
            {children}
        </p>
    );
}
