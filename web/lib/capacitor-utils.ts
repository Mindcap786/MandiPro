import { Capacitor } from '@capacitor/core'

/**
 * Utility to check if the application should show the "Native-Feeling" UI.
 *
 * Priority order:
 *  1. Capacitor.isNativePlatform() — definitive: we're inside a native WebView
 *  2. NEXT_PUBLIC_CAPACITOR=true  — build-time flag injected by build-mobile.sh
 *     This fires when the static bundle runs on both real devices AND emulators,
 *     regardless of the reported window viewport width.
 *  3. window.innerWidth < 768     — fallback for Chrome DevTools mobile simulation
 */
export function isNativePlatform(): boolean {
    if (typeof window === 'undefined') return false;

    // 1. Definitive Capacitor WebView detection
    if (Capacitor.isNativePlatform()) return true;

    // 2. Build-time Capacitor flag (baked in by build-mobile.sh)
    //    This is the key signal that makes emulators and real devices work correctly
    //    even before Capacitor fully initialises on the first JS tick.
    if (process.env.NEXT_PUBLIC_CAPACITOR === 'true') return true;

    // 3. Browser-only fallback: responsive mobile width (Chrome DevTools, etc.)
    return window.innerWidth < 768;
}

