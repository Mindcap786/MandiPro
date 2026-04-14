'use client'

/**
 * /auth/callback
 *
 * Handles the Supabase PKCE code exchange for web.
 * - Web: Next.js serves this page → exchanges `?code=` for a session
 * - Native: CapacitorProvider intercepts the deep link BEFORE this page loads
 *   so this page is primarily for the web flow.
 */

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function AuthCallbackPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
    const [errorMsg, setErrorMsg] = useState('')

    useEffect(() => {
        const handleCallback = async () => {
            const code = searchParams.get('code')
            const error = searchParams.get('error')
            const errorDescription = searchParams.get('error_description')

            // Handle explicit error from Supabase
            if (error) {
                console.error('[Auth Callback] Error:', error, errorDescription)
                setErrorMsg(errorDescription || error)
                setStatus('error')
                setTimeout(() => router.replace('/login?error=auth_failed'), 3000)
                return
            }

            // PKCE code exchange
            if (code) {
                const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
                if (exchangeError) {
                    console.error('[Auth Callback] Exchange error:', exchangeError.message)
                    setErrorMsg(exchangeError.message)
                    setStatus('error')
                    setTimeout(() => router.replace('/login?error=auth_failed'), 3000)
                    return
                }
                setStatus('success')
                router.replace('/dashboard')
                return
            }

            // No code — check if there's already a valid session (e.g., hash-based flow)
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
                setStatus('success')
                router.replace('/dashboard')
            } else {
                setErrorMsg('No authentication code found')
                setStatus('error')
                setTimeout(() => router.replace('/login'), 3000)
            }
        }

        handleCallback()
    }, [router, searchParams])

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#050510]">
            <div className="text-center">
                {status === 'loading' && (
                    <>
                        <div className="w-12 h-12 border-4 border-neon-green/30 border-t-neon-green rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-white font-semibold text-lg">Signing you in...</p>
                        <p className="text-white/40 text-sm mt-2">Verifying your credentials</p>
                    </>
                )}
                {status === 'success' && (
                    <>
                        <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <p className="text-white font-semibold text-lg">Welcome back!</p>
                        <p className="text-white/40 text-sm mt-2">Redirecting to dashboard...</p>
                    </>
                )}
                {status === 'error' && (
                    <>
                        <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </div>
                        <p className="text-white font-semibold text-lg">Authentication failed</p>
                        <p className="text-red-400 text-sm mt-2">{errorMsg}</p>
                        <p className="text-white/40 text-xs mt-2">Redirecting to login...</p>
                    </>
                )}
            </div>
        </div>
    )
}
