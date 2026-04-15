'use client';

/**
 * SwipeRow
 *
 * A reusable horizontal-swipe row for list items, modeled after the iOS
 * Mail / Vyapar list-row pattern. Reveals action buttons when the user
 * swipes left. Native-only behavior: on web (or non-touch), the row
 * renders inert and the actions are simply not reachable via swipe — but
 * the children render normally, so desktop is unaffected.
 *
 * Usage:
 *   <SwipeRow actions={[
 *     { label: 'Delete', color: '#dc2626', onClick: () => del(id) },
 *     { label: 'Edit',   color: '#2563eb', onClick: () => edit(id) },
 *   ]}>
 *     <YourRowContent />
 *   </SwipeRow>
 */

import { ReactNode, useEffect, useRef, useState } from 'react';

export interface SwipeAction {
    label: string;
    color: string;
    onClick: () => void;
}

const ACTION_WIDTH = 88;

export function SwipeRow({
    children,
    actions,
}: {
    children: ReactNode;
    actions: SwipeAction[];
}) {
    const [offset, setOffset] = useState(0);
    const [enabled, setEnabled] = useState(false);
    const startX = useRef<number | null>(null);
    const startOffset = useRef(0);

    useEffect(() => {
        (async () => {
            try {
                const { Capacitor } = await import('@capacitor/core');
                if (Capacitor.isNativePlatform()) setEnabled(true);
            } catch {
                /* not native — keep disabled */
            }
        })();
    }, []);

    if (!enabled) return <>{children}</>;

    const maxOpen = -ACTION_WIDTH * actions.length;

    const onTouchStart = (e: React.TouchEvent) => {
        startX.current = e.touches[0].clientX;
        startOffset.current = offset;
    };
    const onTouchMove = (e: React.TouchEvent) => {
        if (startX.current == null) return;
        const dx = e.touches[0].clientX - startX.current;
        let next = startOffset.current + dx;
        if (next > 0) next = 0;
        if (next < maxOpen * 1.15) next = maxOpen * 1.15;
        setOffset(next);
    };
    const onTouchEnd = () => {
        startX.current = null;
        // Snap open or closed
        if (offset < maxOpen / 2) setOffset(maxOpen);
        else setOffset(0);
    };

    return (
        <div style={{ position: 'relative', overflow: 'hidden' }}>
            {/* Action layer */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                }}
            >
                {actions.map((a) => (
                    <button
                        key={a.label}
                        onClick={() => {
                            a.onClick();
                            setOffset(0);
                        }}
                        style={{
                            width: ACTION_WIDTH,
                            background: a.color,
                            color: '#fff',
                            fontWeight: 800,
                            fontSize: 12,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            border: 'none',
                        }}
                    >
                        {a.label}
                    </button>
                ))}
            </div>
            {/* Content layer */}
            <div
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                style={{
                    transform: `translateX(${offset}px)`,
                    transition: startX.current == null ? 'transform 220ms cubic-bezier(0.2,0.8,0.2,1)' : undefined,
                    background: '#fff',
                    position: 'relative',
                    zIndex: 1,
                }}
            >
                {children}
            </div>
        </div>
    );
}
