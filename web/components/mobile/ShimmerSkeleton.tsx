"use client";

import { cn } from "@/lib/utils";

/**
 * ShimmerSkeleton — replaces ALL Loader2 spinners with native-feeling
 * content-mirror skeleton loading states.
 * 
 * The shimmer animation is defined in globals.css / mobile-native.css.
 */

interface SkeletonProps {
    className?: string;
    /** Rounded corners preset */
    rounded?: "sm" | "md" | "lg" | "full";
}

export function Skeleton({ className, rounded = "md" }: SkeletonProps) {
    const roundedCls = {
        sm: "rounded",
        md: "rounded-lg",
        lg: "rounded-2xl",
        full: "rounded-full",
    }[rounded];

    return (
        <div className={cn("skeleton", roundedCls, className)} />
    );
}

// ── Pre-built skeleton card layouts ──────────────────────────────────────────

export function SkeletonCard({ className }: { className?: string }) {
    return (
        <div className={cn("bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)] space-y-3", className)}>
            <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 flex-shrink-0" rounded="lg" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-6 w-16 flex-shrink-0" rounded="full" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
        </div>
    );
}

export function SkeletonSummaryCard({ className }: { className?: string }) {
    return (
        <div className={cn("bg-[#1A6B3C] rounded-2xl p-5 space-y-4", className)}>
            <div className="flex justify-between items-start">
                <Skeleton className="h-4 w-32 bg-white/20" rounded="md" />
                <Skeleton className="h-6 w-20 bg-white/20" rounded="full" />
            </div>
            <Skeleton className="h-10 w-48 bg-white/30" rounded="md" />
            <div className="grid grid-cols-3 gap-4">
                {[0, 1, 2].map(i => (
                    <div key={i} className="space-y-1">
                        <Skeleton className="h-3 w-full bg-white/20" rounded="md" />
                        <Skeleton className="h-5 w-full bg-white/30" rounded="md" />
                    </div>
                ))}
            </div>
        </div>
    );
}

export function SkeletonListScreen({ count = 5 }: { count?: number }) {
    return (
        <div className="space-y-3 px-4">
            {Array.from({ length: count }).map((_, i) => (
                <SkeletonCard key={i} />
            ))}
        </div>
    );
}

export function SkeletonDashboard() {
    return (
        <div className="space-y-4 px-4 py-3">
            <SkeletonSummaryCard />
            {/* Quick action row */}
            <div className="flex gap-3 overflow-hidden">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex-shrink-0 w-[72px] space-y-2">
                        <Skeleton className="w-full h-12" rounded="lg" />
                        <Skeleton className="h-3 w-3/4 mx-auto" rounded="full" />
                    </div>
                ))}
            </div>
            {/* List cards */}
            <Skeleton className="h-4 w-36" rounded="md" />
            <SkeletonListScreen count={4} />
        </div>
    );
}

export function SkeletonStockGrid() {
    return (
        <div className="grid grid-cols-2 gap-3 px-4">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl p-3 shadow-card space-y-3">
                    <Skeleton className="w-full h-28" rounded="lg" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-2 w-full" rounded="full" />
                </div>
            ))}
        </div>
    );
}
