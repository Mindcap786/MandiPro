"use client";

import { Bell } from 'lucide-react';
import { useStockAlerts } from '@/hooks/use-stock-alerts';
import { useState } from 'react';
import { AlertsBottomSheet } from './AlertsBottomSheet';
import { motion, AnimatePresence } from 'framer-motion';

export function AlertBell() {
    const { unreadCount, alerts } = useStockAlerts();
    const [sheetOpen, setSheetOpen] = useState(false);

    // If there are emergencies, blink the bell
    const hasEmergency = alerts.some(a => !a.is_resolved && (a.severity === 'emergency' || a.severity === 'critical'));

    return (
        <>
            <button 
                onClick={() => setSheetOpen(true)}
                className="relative p-2 rounded-full hover:bg-slate-100 transition-colors"
                style={{ WebkitTapHighlightColor: 'transparent' }}
            >
                <Bell className={`w-6 h-6 ${hasEmergency ? 'text-red-500' : 'text-slate-600'}`} />
                
                <AnimatePresence>
                    {unreadCount > 0 && (
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            className="absolute top-1 right-1 min-w-[20px] h-[20px] flex items-center justify-center bg-red-600 text-white text-[10px] font-black rounded-full px-1.5 shadow-sm border-2 border-white"
                        >
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </motion.div>
                    )}
                </AnimatePresence>
            </button>

            <AlertsBottomSheet 
                isOpen={sheetOpen} 
                onClose={() => setSheetOpen(false)} 
            />
        </>
    );
}
