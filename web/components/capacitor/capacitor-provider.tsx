'use client';

/**
 * CapacitorProvider — Phase 6 Enhanced
 *
 * Handles:
 *   1. Adds `capacitor-native` + `is-native-app` classes to <html>/<body>
 *   2. White StatusBar (matches NativeTopBar)
 *   3. Deep Link Auth (Supabase PKCE)
 *   4. Android Back Button with 2-tap-to-exit
 *   5. Keyboard: adds/removes `keyboard-open` class + padding push
 *   6. Haptics: global tap listener triggers ImpactLight on interactive elements
 *   7. Input hints: adds inputmode="decimal" to number inputs for Android
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { initializePush } from '@/lib/push-notifications';
import { usePermission } from '@/hooks/use-permission';

export function CapacitorProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { profile } = usePermission();

    // ── 1. Boot up Native Core (StatusBar, UI classes, etc.) ──────────────────

    useEffect(() => {
        const initCapacitor = async () => {
            try {
                const { Capacitor: Cap } = await import('@capacitor/core');
                const { App } = await import('@capacitor/app');
                const { isNativePlatform } = await import('@/lib/capacitor-utils');

                const isMobileView = isNativePlatform();

                // ── 1. Apply native CSS classes ────────────────────────────────
                // We apply these if we're in Capacitor OR on a mobile browser
                // so the user can test the UI in the browser simulator.
                if (isMobileView) {
                    document.documentElement.classList.add('capacitor-native');
                    document.body.classList.add('is-native-app');
                }

                // If not native platform, stop here (StatusBar/App/Keyboard are native only)
                if (!Cap.isNativePlatform()) return;

                // ── 2. Safe Area spacer for status bar ─────────────────────────

                // ── 2. Safe Area spacer for status bar ─────────────────────────
                if (!document.getElementById('cap-safe-top')) {
                    const spacer = document.createElement('div');
                    spacer.id = 'cap-safe-top';
                    document.body.insertBefore(spacer, document.body.firstChild);
                }

                // ── 3. StatusBar — WHITE to match NativeTopBar ─────────────────
                try {
                    const { StatusBar: SB, Style } = await import('@capacitor/status-bar');
                    await SB.setStyle({ style: Style.Dark }); // dark icons on white bg
                    await SB.setBackgroundColor({ color: '#FFFFFF' });
                } catch (_) { /* StatusBar optional */ }

                // ── 4. Deep Link Handler (Supabase Auth) ───────────────────────
                App.addListener('appUrlOpen', async ({ url }: { url: string }) => {
                    console.log('[Capacitor] Deep link:', url);
                    if (url.includes('auth/callback') || url.includes('access_token') || url.includes('code=')) {
                        try {
                            const parsed = new URL(url.replace('mandigrow://', 'https://mandigrow.app/'));
                            const hash = parsed.hash.substring(1);
                            const params = new URLSearchParams(hash || parsed.search);
                            const accessToken = params.get('access_token');
                            const refreshToken = params.get('refresh_token');
                            const code = params.get('code');

                            if (accessToken && refreshToken) {
                                const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
                                if (!error) router.replace('/dashboard');
                                else router.replace('/login?error=auth_failed');
                            } else if (code) {
                                const { error } = await supabase.auth.exchangeCodeForSession(code);
                                if (!error) router.replace('/dashboard');
                                else router.replace('/login?error=auth_failed');
                            }
                        } catch (err) {
                            console.error('[Capacitor] Deep link parse error:', err);
                        }
                    }
                });

                // ── 5. Android Back Button ─────────────────────────────────────
                let backPressCount = 0;
                let backPressTimer: ReturnType<typeof setTimeout> | null = null;

                App.addListener('backButton', ({ canGoBack }: { canGoBack: boolean }) => {
                    if (canGoBack) { window.history.back(); return; }

                    backPressCount++;
                    if (backPressCount === 1) {
                        const toast = document.createElement('div');
                        toast.textContent = 'Press back again to exit';
                        toast.style.cssText = `
                            position:fixed;bottom:calc(80px + env(safe-area-inset-bottom));
                            left:50%;transform:translateX(-50%);
                            background:rgba(26,26,46,0.92);color:#fff;
                            padding:10px 20px;border-radius:20px;
                            font-size:13px;font-weight:600;z-index:99999;
                            font-family:-apple-system,sans-serif;
                            white-space:nowrap;letter-spacing:0.01em;
                        `;
                        document.body.appendChild(toast);
                        backPressTimer = setTimeout(() => {
                            backPressCount = 0;
                            if (document.body.contains(toast)) document.body.removeChild(toast);
                        }, 2000);
                    } else {
                        if (backPressTimer) clearTimeout(backPressTimer);
                        App.exitApp();
                    }
                });

                // ── 6. Keyboard — safe area + keyboard-open class ──────────────
                try {
                    const { Keyboard: KB } = await import('@capacitor/keyboard');

                    KB.addListener('keyboardWillShow', ({ keyboardHeight }: { keyboardHeight: number }) => {
                        document.documentElement.classList.add('keyboard-open');
                        document.body.style.paddingBottom = `${keyboardHeight}px`;
                        setTimeout(() => {
                            const el = document.activeElement as HTMLElement;
                            if (el && typeof el.scrollIntoView === 'function') {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        }, 100);
                    });

                    KB.addListener('keyboardWillHide', () => {
                        document.documentElement.classList.remove('keyboard-open');
                        document.body.style.paddingBottom = '';
                    });

                    // Dismiss keyboard on outside tap
                    document.addEventListener('touchstart', (e) => {
                        const target = e.target as HTMLElement;
                        const isInput = target.matches('input, textarea, select, [contenteditable]');
                        if (!isInput && document.documentElement.classList.contains('keyboard-open')) {
                            KB.hide();
                        }
                    }, { passive: true });

                } catch (_) { /* Keyboard optional */ }

                // ── 7. Haptics — ImpactLight on interactive elements ───────────
                try {
                    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
                    document.addEventListener('touchstart', (e) => {
                        const target = e.target as HTMLElement;
                        // Trigger on buttons, links, and elements with data-haptic
                        if (target.closest('button, a, [data-haptic], [role="button"]')) {
                            Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
                        }
                    }, { passive: true });
                } catch (_) { /* Haptics optional; silently skip in browser */ }

                // ── 8. Fix Android number inputs ───────────────────────────────
                // Add inputmode="decimal" to all number inputs for Android numeric keyboard
                const fixNumberInputs = () => {
                    document.querySelectorAll('input[type="number"]').forEach((el) => {
                        if (!(el as HTMLInputElement).getAttribute('inputmode')) {
                            (el as HTMLInputElement).setAttribute('inputmode', 'decimal');
                        }
                    });
                };
                fixNumberInputs();
                // Observe DOM changes to fix dynamically added inputs
                const observer = new MutationObserver(fixNumberInputs);
                observer.observe(document.body, { childList: true, subtree: true });

                console.log('[CapacitorProvider] Native initialized ✓ (v2 — green theme)');

            } catch (err) {
                // Not in Capacitor — web build; expected in browsers
            }
        };

        initCapacitor();
    }, [router]);

    // ── 2. Initialize Push (Authenticated only) ──────────────────────────────
    useEffect(() => {
        if (profile?.id && profile?.organization_id) {
            initializePush(profile.id, profile.organization_id, router);
        }
    }, [profile?.id, profile?.organization_id, router]);

    return <>{children}</>;
}
