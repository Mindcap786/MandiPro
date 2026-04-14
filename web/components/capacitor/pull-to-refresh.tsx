'use client';

/**
 * PullToRefresh
 *
 * Native-only global pull-to-refresh. Mounts a single window-level touch
 * listener that detects an overscroll-from-top gesture and triggers
 * router.refresh() once the pull crosses a threshold. Displays a small
 * spinner pill that follows the finger.
 *
 * No DOM wrapping — safe to add anywhere in the tree. Self-gates on
 * Capacitor.isNativePlatform(); on web it renders nothing and attaches
 * no listeners, so desktop is provably untouched.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const TRIGGER_PX = 70;
const MAX_PX = 110;

export function PullToRefresh() {
    const router = useRouter();
    const [isNative, setIsNative] = useState(false);
    const [pull, setPull] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const startY = useRef<number | null>(null);
    const pulling = useRef(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { Capacitor } = await import('@capacitor/core');
                if (cancelled || !Capacitor.isNativePlatform()) return;
                setIsNative(true);
            } catch {
                /* not native */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!isNative) return;

        const atTop = () =>
            (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0;

        const onStart = (e: TouchEvent) => {
            if (!atTop()) return;
            startY.current = e.touches[0].clientY;
            pulling.current = true;
        };
        const onMove = (e: TouchEvent) => {
            if (!pulling.current || startY.current == null) return;
            const dy = e.touches[0].clientY - startY.current;
            if (dy <= 0) {
                setPull(0);
                return;
            }
            // Resistance curve
            const resisted = Math.min(MAX_PX, dy * 0.55);
            setPull(resisted);
        };
        const onEnd = async () => {
            if (!pulling.current) return;
            pulling.current = false;
            startY.current = null;
            if (pull >= TRIGGER_PX && !refreshing) {
                setRefreshing(true);
                try {
                    router.refresh();
                } finally {
                    setTimeout(() => {
                        setRefreshing(false);
                        setPull(0);
                    }, 600);
                }
            } else {
                setPull(0);
            }
        };

        window.addEventListener('touchstart', onStart, { passive: true });
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onEnd, { passive: true });
        window.addEventListener('touchcancel', onEnd, { passive: true });
        return () => {
            window.removeEventListener('touchstart', onStart);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onEnd);
            window.removeEventListener('touchcancel', onEnd);
        };
    }, [isNative, pull, refreshing, router]);

    if (!isNative || (pull <= 0 && !refreshing)) return null;

    const visible = refreshing ? TRIGGER_PX : pull;
    const ready = pull >= TRIGGER_PX || refreshing;

    return (
        <div
            className="ptr-indicator"
            style={{
                position: 'fixed',
                top: `calc(env(safe-area-inset-top) + ${Math.max(8, visible - 20)}px)`,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 40,
                height: 40,
                borderRadius: 999,
                background: 'rgba(255,255,255,0.95)',
                boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9998,
                transition: refreshing ? 'top 200ms ease-out' : undefined,
            }}
        >
            <Loader2
                className={ready ? 'animate-spin' : ''}
                style={{
                    width: 20,
                    height: 20,
                    color: '#7c3aed',
                    transform: ready ? undefined : `rotate(${pull * 4}deg)`,
                }}
            />
        </div>
    );
}
