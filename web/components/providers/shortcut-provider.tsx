'use client';

import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';

export function ShortcutProvider({ children }: { children: React.ReactNode }) {
    useKeyboardShortcuts();
    return <>{children}</>;
}
