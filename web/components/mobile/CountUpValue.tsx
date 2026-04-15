"use client";

import { useEffect, useState, useRef } from "react";
import { useMotionValue, useSpring, useTransform, motion, animate } from "framer-motion";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { isNativePlatform } from "@/lib/capacitor-utils";

interface CountUpValueProps {
    value: number;
    prefix?: string;
    suffix?: string;
    decimals?: number;
    className?: string;
}

export function CountUpValue({
    value,
    prefix = "",
    suffix = "",
    decimals = 0,
    className
}: CountUpValueProps) {
    const [displayValue, setDisplayValue] = useState(0);
    const count = useMotionValue(0);
    const rounded = useTransform(count, (latest) => {
        return latest.toFixed(decimals);
    });

    useEffect(() => {
        // Only trigger haptics if value actually increases on native
        const controls = animate(count, value, {
            duration: 1.5,
            ease: "easeOut",
            onUpdate: (latest) => {
                setDisplayValue(latest);
            },
            onComplete: () => {
                if (isNativePlatform()) {
                    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
                }
            }
        });

        return () => controls.stop();
    }, [value, count]);

    return (
        <motion.span className={className}>
            {prefix}
            {displayValue.toLocaleString(undefined, {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            })}
            {suffix}
        </motion.span>
    );
}

// ── Compact Version for K/L/Cr ───────────────────────────────────────────────

export function CountUpCompactValue({
    value,
    className
}: {
    value: number;
    className?: string;
}) {
    const [display, setDisplay] = useState("");

    useEffect(() => {
        const controls = animate(0, value, {
            duration: 1.5,
            ease: "easeOut",
            onUpdate: (latest) => {
                if (latest >= 10_000_000) {
                    setDisplay(`₹${(latest / 10_000_000).toFixed(1).replace(/\.0$/, "")}Cr`);
                } else if (latest >= 100_000) {
                    setDisplay(`₹${(latest / 100_000).toFixed(1).replace(/\.0$/, "")}L`);
                } else if (latest >= 1_000) {
                    setDisplay(`₹${(latest / 1_000).toFixed(1).replace(/\.0$/, "")}K`);
                } else {
                    setDisplay(`₹${Math.floor(latest).toLocaleString()}`);
                }
            }
        });
        return () => controls.stop();
    }, [value]);

    return <span className={className}>{display}</span>;
}
