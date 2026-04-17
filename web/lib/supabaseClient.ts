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
        }
    })
    : createBrowserClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            flowType: 'pkce',
            detectSessionInUrl: true,
            persistSession: true,
            autoRefreshToken: true,
            // CRITICAL FIX: The lock option must be a FUNCTION with signature:
            //   (name: string, acquireTimeout: number, fn: () => Promise<T>) => Promise<T>
            // Using an object { acquire, release } is WRONG and causes:
            //   "TypeError: this.lock is not a function" at rD._acquireLock
            // This crashes auth init both in the browser and during Next.js SSG.
            // The passthrough function simply runs fn() immediately (no real locking needed
            // since AuthProvider now serializes all auth calls itself).
            lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<unknown>) => fn(),
        },
    })

/**
 * Export redirect URL helper so login pages can pass it per auth call:
 * supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: getAuthRedirectUrl() } })
 */
export { getRedirectUrl as getAuthRedirectUrl }

