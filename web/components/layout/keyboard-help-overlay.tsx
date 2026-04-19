"use client";

import React, { useEffect, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export function KeyboardHelpOverlay() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const handleOpen = () => setOpen(true);
        const handleClose = () => setOpen(false);

        window.addEventListener('keyboard-help', handleOpen);
        window.addEventListener('close-overlays', handleClose);

        return () => {
            window.removeEventListener('keyboard-help', handleOpen);
            window.removeEventListener('close-overlays', handleClose);
        };
    }, []);

    const shortcutGroups = [
        {
            title: "Global Navigation",
            items: [
                { label: "Dashboard", keys: ["Alt", "D"] },
                { label: "Quick Purchase", keys: ["Alt", "P", "or F2"] },
                { label: "Sales & Billing", keys: ["Alt", "S", "or F3"] },
                { label: "POS", keys: ["Alt", "O", "or F4"] },
                { label: "Day Book", keys: ["Alt", "B", "or F9"] },
                { label: "Finance", keys: ["Alt", "F", "or F10"] },
                { label: "Payments/Receipts", keys: ["Alt", "Y", "or F8"] },
                { label: "Stock Status", keys: ["Alt", "K"] },
            ]
        },
        {
            title: "Forms (Tally-Style)",
            items: [
                { label: "Next Field", keys: ["Enter", "or Tab"] },
                { label: "Save / Submit Entry", keys: ["Ctrl", "S"] },
                { label: "Clear / New Entry", keys: ["Ctrl", "N"] },
                { label: "Cancel / Close", keys: ["Esc"] },
            ]
        },
        {
            title: "Tables & Lists",
            items: [
                { label: "Navigate Rows", keys: ["↑", "↓"] },
                { label: "Open Selected Row", keys: ["Enter"] },
                { label: "Search Table", keys: ["Ctrl", "F"] },
                { label: "Print", keys: ["Ctrl", "P"] },
                { label: "Export", keys: ["Ctrl", "E"] },
            ]
        },
        {
            title: "Power Tools",
            items: [
                { label: "Quick Command Palette", keys: ["Ctrl or ⌘", "K"] },
                { label: "Smart Refresh (No reload)", keys: ["F5"] },
                { label: "Keyboard Shortcuts Help", keys: ["Alt+H", "or F1"] },
            ]
        }
    ];

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-4xl p-0 overflow-hidden bg-slate-900 border-slate-800 text-slate-200">
                <DialogHeader className="px-8 pt-8 pb-6 bg-slate-950/50 border-b border-slate-800">
                    <DialogTitle className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
                        ⌨️ Keyboard Shortcuts
                        <span className="text-xs font-bold px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-md uppercase tracking-wider">
                            Supercharge Speed
                        </span>
                    </DialogTitle>
                    <p className="text-slate-400 text-sm mt-1">
                        Use these shortcuts to navigate the MandiGrow ERP at instant speed, without touching the mouse.
                    </p>
                </DialogHeader>

                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                    {shortcutGroups.map((group, idx) => (
                        <div key={idx}>
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4 pb-2 border-b border-slate-800">
                                {group.title}
                            </h3>
                            <div className="space-y-3">
                                {group.items.map((item, i) => (
                                    <div key={i} className="flex items-center justify-between group">
                                        <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                                            {item.label}
                                        </span>
                                        <div className="flex gap-1.5">
                                            {item.keys.map((k, j) => (
                                                <kbd
                                                    key={j}
                                                    className="px-2 py-1 bg-slate-800 border-b-2 border-slate-700 rounded text-xs font-mono font-bold text-slate-300 min-w-[28px] text-center"
                                                >
                                                    {k}
                                                </kbd>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
