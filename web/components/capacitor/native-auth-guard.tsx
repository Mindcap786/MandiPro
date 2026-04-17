'use client'

/**
 * NativeAuthGuard
 *
 * Client-side route protection for Capacitor native builds.
 * The web middleware (middleware.ts) handles server-side route protection.
 * This guard activates ONLY inside the native WebView where there is no server.
 *
 * Strategy:
 * - If NOT on native platform → render children immediately (middleware handles it)
 * - If ON native platform → check Supabase session before rendering
 * - If no session on native → redirect to /login
 * - CAPACITOR env flag ensures this never interferes with the web build
 */

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { cacheClearForSession, setActiveCacheUser } from '@/lib/data-cache'

// Routes that don't require auth (mirrors middleware.ts PUBLIC_ROUTES)
const PUBLIC_PATHS = [
    '/',
    '/login',
    '/subscribe',
    '/checkout',
    '/auth/callback',
    '/public',
]

function isPublicPath(pathname: string): boolean {
    return PUBLIC_PATHS.some(path =>
        pathname === path || pathname.startsWith(path + '/')
    )
}

interface NativeAuthGuardProps {
    children: React.ReactNode
}

export function NativeAuthGuard({ children }: NativeAuthGuardProps) {
    const router = useRouter()
    const pathname = usePathname()
    const [isReady, setIsReady] = useState(false)
    const [isNativePlatform, setIsNativePlatform] = useState(false)

    useEffect(() => {
        const check = async () => {
            // Detect if running in Capacitor native environment
            let native = false
            try {
                const { Capacitor } = await import('@capacitor/core')
                native = Capacitor.isNativePlatform()
            } catch (_) {
                native = false
            }

            setIsNativePlatform(native)

            if (!native) {
                // Web build: middleware handles auth — just render immediately
                setIsReady(true)
                return
            }

            // Native platform: check session client-side
            if (isPublicPath(pathname)) {
                setIsReady(true)
                return
            }

            const { data: { session }, error } = await supabase.auth.getSession()

            if (error || !session) {
                console.log('[NativeAuthGuard] No session — redirecting to login')
                router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`)
                return
            }

            setIsReady(true)
        }

        check()
    }, [pathname, router])

    // Listen for auth state changes (e.g., after deep link login completes)
    useEffect(() => {
        if (!isNativePlatform) return

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                // Flush the cache when mobile session ends (mirrors web AuthProvider behaviour)
                setActiveCacheUser(null);
                cacheClearForSession();
                router.replace('/login')
            }
            if (event === 'SIGNED_IN' && !isPublicPath(pathname)) {
                if (session?.user) setActiveCacheUser(session.user.id);
                setIsReady(true)
            }
        })

        return () => subscription.unsubscribe()
    }, [isNativePlatform, pathname, router])

    // Show loading state while checking session on native
    if (!isReady && isNativePlatform) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#050510]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-white/10 border-t-white/60 rounded-full animate-spin" />
                    <span className="text-white/40 text-sm font-medium">Loading MandiGrow...</span>
                </div>
            </div>
        )
    }

    return <>{children}</>
}
