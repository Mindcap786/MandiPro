'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export function useKeyboardShortcuts() {
    const router = useRouter();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const activeElement = document.activeElement;
            const isInput = activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName);

            // 1. Help Overlay: Ctrl + /, Cmd + /, Alt + H, F1
            if (
                ((e.ctrlKey || e.metaKey) && e.code === 'Slash') ||
                ((e.altKey || e.metaKey) && e.code === 'KeyH') ||
                e.code === 'F1'
            ) {
                e.preventDefault();
                window.dispatchEvent(new Event('keyboard-help'));
                return;
            }

            // 2. Escape: Broadcast custom event to close overlays/modals
            if (e.key === 'Escape') {
                // Not calling preventDefault because core UI inputs need Escape to clear
                window.dispatchEvent(new Event('close-overlays'));
            }

            // 3. F-keys navigation (always active)
            if (e.key === 'F2') {
                e.preventDefault();
                router.push('/arrivals/new');
                toast.success('→ Quick Purchase');
                return;
            }
            if (e.key === 'F3') {
                e.preventDefault();
                router.push('/sales/new');
                toast.success('→ New Sale');
                return;
            }
            if (e.key === 'F4') {
                e.preventDefault();
                router.push('/sales/pos');
                toast.success('→ POS');
                return;
            }
            if (e.key === 'F5') {
                e.preventDefault();
                window.dispatchEvent(new Event('smart-refresh'));
                toast.success('↻ Refreshing Data');
                return;
            }
            if (e.key === 'F8') {
                e.preventDefault();
                router.push('/finance?tab=receipts');
                toast.success('→ Payments & Receipts');
                return;
            }
            if (e.key === 'F9') {
                e.preventDefault();
                router.push('/reports/daybook');
                toast.success('→ Day Book');
                return;
            }
            if (e.key === 'F10') {
                e.preventDefault();
                router.push('/finance');
                toast.success('→ Finance Overview');
                return;
            }

            // If user is typing normally in an input, ignore ALPHABET shortcuts
            if (isInput && !e.altKey && !e.metaKey && !e.ctrlKey) return;

            // 4. Alt / Option Global Navigations
            if (e.altKey || e.metaKey) {
                const code = e.code; // 'KeyD', 'KeyP', etc.
                
                const routeMap: Record<string, { path: string, label: string }> = {
                    'KeyD': { path: '/dashboard', label: 'Dashboard' },
                    'KeyP': { path: '/arrivals/new', label: 'Quick Purchase' },
                    'KeyS': { path: '/sales', label: 'Sales & Billing' },
                    'KeyO': { path: '/sales/pos', label: 'POS' },
                    'KeyR': { path: '/returns', label: 'Returns' },
                    'KeyK': { path: '/warehouse', label: 'Stock Status' },
                    'KeyY': { path: '/finance?tab=receipts', label: 'Payments & Receipts' },
                    'KeyF': { path: '/finance', label: 'Finance Overview' },
                    'KeyB': { path: '/reports/daybook', label: 'Day Book' },
                    'KeyG': { path: '/reports/gst', label: 'GST Compliance' },
                    'KeyC': { path: '/finance?tab=cheques', label: 'Cheque Management' },
                };

                if (routeMap[code]) {
                    e.preventDefault();
                    router.push(routeMap[code].path);
                    toast.success(`→ ${routeMap[code].label}`);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [router]);
}
