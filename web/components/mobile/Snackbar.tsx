"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Snackbar — replaces ALL top-of-screen toasts.
 * 
 * Positioned above BottomNav (bottom-20).
 * Auto-dismisses after 3s.
 * Success: green left accent
 * Error: red left accent
 * Info: blue left accent
 */

type SnackbarVariant = "success" | "error" | "info";

interface SnackbarMessage {
    id: string;
    message: string;
    variant: SnackbarVariant;
}

// ── Global snackbar store ─────────────────────────────────────────────────────

let listeners: Array<(msg: SnackbarMessage) => void> = [];

export const snackbar = {
    success: (message: string) => emit({ id: Date.now().toString(), message, variant: "success" }),
    error: (message: string) => emit({ id: Date.now().toString(), message, variant: "error" }),
    info: (message: string) => emit({ id: Date.now().toString(), message, variant: "info" }),
};

function emit(msg: SnackbarMessage) {
    listeners.forEach(fn => fn(msg));
}

// ── SnackbarProvider — mount once in layout ────────────────────────────────────

export function SnackbarProvider() {
    const [messages, setMessages] = useState<SnackbarMessage[]>([]);

    const addMessage = useCallback((msg: SnackbarMessage) => {
        setMessages(prev => [...prev.slice(-2), msg]); // max 3 visible
        setTimeout(() => {
            setMessages(prev => prev.filter(m => m.id !== msg.id));
        }, 3000);
    }, []);

    useEffect(() => {
        listeners.push(addMessage);
        return () => { listeners = listeners.filter(fn => fn !== addMessage); };
    }, [addMessage]);

    const accentColors: Record<SnackbarVariant, string> = {
        success: "#16A34A",
        error: "#DC2626",
        info: "#2563EB",
    };

    const Icons: Record<SnackbarVariant, React.ElementType> = {
        success: CheckCircle2,
        error: XCircle,
        info: Info,
    };

    return (
        <div 
            className="fixed left-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none"
            style={{ bottom: "calc(72px + env(safe-area-inset-bottom) + 8px)" }}
        >
            <AnimatePresence mode="sync">
                {messages.map((msg) => {
                    const Icon = Icons[msg.variant];
                    const accent = accentColors[msg.variant];
                    return (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            className="pointer-events-auto"
                        >
                            <div className="bg-[#1A1A2E] text-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xl overflow-hidden relative">
                                {/* Left accent */}
                                <div
                                    className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
                                    style={{ backgroundColor: accent }}
                                />
                                <Icon
                                    className="w-5 h-5 flex-shrink-0 ml-1"
                                    style={{ color: accent }}
                                />
                                <p className="text-sm font-medium flex-1">{msg.message}</p>
                            </div>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
