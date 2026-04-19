'use client';

import { useEffect } from 'react';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useRouter } from 'next/navigation';
import { cacheClear } from '@/lib/data-cache';

export function ShortcutProvider({ children }: { children: React.ReactNode }) {
    useKeyboardShortcuts();
    const router = useRouter();

    useEffect(() => {
        const handleSmartRefresh = () => {
            cacheClear();
            router.refresh();
        };

        window.addEventListener('smart-refresh', handleSmartRefresh);
        return () => window.removeEventListener('smart-refresh', handleSmartRefresh);
    }, [router]);

    return <>{children}</>;
}
