'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export function useKeyboardShortcuts() {
    const router = useRouter();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only trigger if Alt (Windows/Linux) or Meta/Cmd (Mac) is pressed
            // and we are NOT inside a text input/textarea (unless the modifier is held, which usually means a shortcut)
            const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName);

            // If they are just typing normally, ignore
            if (isInput && !e.altKey && !e.metaKey) return;

            // Global Shortcuts
            if ((e.altKey || e.metaKey) && e.key.toLowerCase() === 'n') {
                e.preventDefault();
                router.push('/sales/pos');
                toast.info('Opening New Sale (PoS)');
            }
            if ((e.altKey || e.metaKey) && e.key.toLowerCase() === 'p') {
                e.preventDefault();
                router.push('/arrivals/new');
                toast.info('Opening New Purchase/Arrival');
            }
            if ((e.altKey || e.metaKey) && e.key.toLowerCase() === 'r') {
                e.preventDefault();
                router.push('/finance?tab=receipts');
                toast.info('Opening Receipts');
            }
            if ((e.altKey || e.metaKey) && e.key.toLowerCase() === 'e') {
                e.preventDefault();
                router.push('/finance?tab=payments');
                toast.info('Opening Payments / Expenses');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [router]);
}
