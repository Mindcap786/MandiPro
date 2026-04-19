import { Capacitor } from '@capacitor/core'

/**
 * Utility to check if the application should show the "Native-Feeling" UI.
 *
 * Priority order:
 *  1. Capacitor.isNativePlatform() — definitive: we're inside a native WebView
 *  2. NEXT_PUBLIC_CAPACITOR=true  — build-time flag injected by build-mobile.sh
 *  3. User Agent contains Mobile signal — very strong indicator of a phone browser
 *  4. window.innerWidth < 1024    — fallback (increased from 768 to handle massive S26 Ultra/iPhone Pro Max types)
 */
export function isNativePlatform(): boolean {
    if (typeof window === 'undefined') return false;

    // 1. Definitive Capacitor WebView detection
    if (Capacitor.isNativePlatform()) return true;

    // 2. Build-time Capacitor flag (baked in by build-mobile.sh)
    if (process.env.NEXT_PUBLIC_CAPACITOR === 'true') return true;

    // 3. User Agent Check — identify phones/tablets even if viewport is wide
    const ua = navigator.userAgent || "";
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    if (isMobileUA) return true;

    // 4. Browser-only fallback: responsive mobile/tablet width
    // Increased to 1024 to catch all modern "Phablets" and portrait tablets
    return window.innerWidth < 1024;
}

