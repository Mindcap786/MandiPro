import { createBrowserClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Critical: Missing Supabase Environment Variables!')
} else {
    console.log('✅ Supabase initialized with URL:', supabaseUrl.substring(0, 15) + '...')
}

// Detect if we're in a Capacitor native environment
// This check works at runtime in the WebView
export function isNative(): boolean {
    if (typeof window === 'undefined') return false
    // Capacitor sets this globally on the window object
    return !!(window as any).Capacitor?.isNativePlatform?.()
}

/**
 * Returns the correct auth redirect URL:
 * - Native app → deep link scheme mandigrow://auth/callback
 * - Web browser → standard origin-relative path
 */
function getRedirectUrl(): string {
    if (isNative()) {
        return 'mandigrow://auth/callback'
    }
    if (typeof window !== 'undefined') {
        return `${window.location.origin}/auth/callback`
    }
    return `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/callback`
}

/**
 * FIX: Custom fetch wrapper to disable HTTP caching (prevents 304 Not Modified issues)
 * This ensures Supabase always returns full responses instead of 304s with empty bodies
 */
function customFetch(url: string, options: RequestInit = {}): Promise<Response> {
    return fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            // Explicitly disable caching at HTTP level
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        }
    })
}

// Supabase client initialization
// On Native: Use raw createClient (no cookie SSR parsing) to avoid WebView hangs
// On Web: Use createBrowserClient for seamless Next.js SSR cookie syncing
export const supabase = isNative()
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            flowType: 'pkce',
            detectSessionInUrl: false, // We handle deep links manually
            persistSession: true,
            autoRefreshToken: true,
            storageKey: 'mandigrow-auth-token',
        },
        global: {
            fetch: customFetch // Use custom fetch with no-cache headers
        }
    })
    : createBrowserClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            flowType: 'pkce',
            detectSessionInUrl: true,
            persistSession: true,
            autoRefreshToken: true,
        },
        global: {
            fetch: customFetch // Use custom fetch with no-cache headers
        }
    })

/**
 * Export redirect URL helper so login pages can pass it per auth call:
 * supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: getAuthRedirectUrl() } })
 */
export { getRedirectUrl as getAuthRedirectUrl }

