'use client';

/**
 * NetworkStatus
 *
 * Renders a small "Offline" pill at the top of the screen when the device
 * loses connectivity. Native-only (gated by `is-native-app` body class via
 * CSS in mobile-native.css). On the web build this component still mounts
 * but the pill is invisible because the .offline-indicator styles only
 * apply under .is-native-app — so desktop is provably untouched.
 *
 * Also injects a global numeric inputmode hint on inputs whose type is
 * "number" — only when running on a native platform — so Android shows the
 * numeric keyboard instead of the alpha keyboard. This runs at most once.
 */

import { useEffect, useState } from 'react';

export function NetworkStatus() {
    const [online, setOnline] = useState(true);
    const [isNative, setIsNative] = useState(false);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const { Capacitor } = await import('@capacitor/core');
                if (cancelled) return;
                if (!Capacitor.isNativePlatform()) return;
                setIsNative(true);

                // Initial state
                setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

                const onOnline = () => setOnline(true);
                const onOffline = () => setOnline(false);
                window.addEventListener('online', onOnline);
                window.addEventListener('offline', onOffline);

                // One-shot: hint numeric keyboard for plain number inputs
                const applyInputModeHints = () => {
                    document
                        .querySelectorAll<HTMLInputElement>('input[type="number"]:not([inputmode])')
                        .forEach((el) => {
                            el.setAttribute('inputmode', 'decimal');
                        });
                };
                applyInputModeHints();
                const mo = new MutationObserver(applyInputModeHints);
                mo.observe(document.body, { childList: true, subtree: true });

                return () => {
                    window.removeEventListener('online', onOnline);
                    window.removeEventListener('offline', onOffline);
                    mo.disconnect();
                };
            } catch {
                // Not native — no-op
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    if (!isNative || online) return null;
    return <div className="offline-indicator">Offline</div>;
}
