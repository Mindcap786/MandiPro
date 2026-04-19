'use client';

import { useEffect, useState, RefObject } from 'react';

/**
 * Hook to add keyboard navigation (Up/Down) to tables or lists.
 */
export function useTableKeyboard({
    rowCount,
    onEnter,
    containerRef,
}: {
    rowCount: number;
    onEnter?: (index: number) => void;
    containerRef?: RefObject<HTMLElement>;
}) {
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if in an input
            const activeElement = document.activeElement;
            if (activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName)) {
                // Except Ctrl+F to focus search, if handled externally
                return;
            }

            if (rowCount === 0) return;

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setFocusedIndex((prev) => (prev < rowCount - 1 ? prev + 1 : prev));
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setFocusedIndex((prev) => (prev > 0 ? prev - 1 : 0));
                    break;
                case 'PageDown':
                    e.preventDefault();
                    setFocusedIndex((prev) => Math.min(prev + 10, rowCount - 1));
                    break;
                case 'PageUp':
                    e.preventDefault();
                    setFocusedIndex((prev) => Math.max(prev - 10, 0));
                    break;
                case 'Home':
                    e.preventDefault();
                    setFocusedIndex(0);
                    break;
                case 'End':
                    e.preventDefault();
                    setFocusedIndex(rowCount - 1);
                    break;
                case 'Enter':
                    if (focusedIndex >= 0 && onEnter) {
                        e.preventDefault();
                        onEnter(focusedIndex);
                    }
                    break;
                case 'p':
                    if (e.ctrlKey || e.metaKey) {
                        // Let the component intercept Ctrl+P to trigger print, or rely on browser
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [rowCount, focusedIndex, onEnter]);

    // Ensure the focused index is visible in the scrollable container
    useEffect(() => {
        if (focusedIndex >= 0 && containerRef?.current) {
            const elements = containerRef.current.querySelectorAll('[data-row-index]');
            const targetElement = elements[focusedIndex] as HTMLElement;
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }, [focusedIndex, containerRef]);

    // Reset focus if rowCount changes drastically
    useEffect(() => {
        if (focusedIndex >= rowCount) setFocusedIndex(-1);
    }, [rowCount]);

    return { focusedIndex, setFocusedIndex };
}
