/**
 * POST /api/auth/new-session
 *
 * MIGRATION-FREE Single Active Session Enforcement.
 *
 * Strategy: Instead of a custom DB column, we store the active_session_token
 * directly in Supabase Auth's built-in `user_metadata`. This is available
 * on every Supabase project with ZERO schema changes.
 *
 * Flow on every login:
 *   1. Validate the new browser's JWT (proves who they are).
 *   2. Generate a new UUID "session token".
 *   3. Write it to user_metadata.active_session_token (NO migration needed).
 *   4. Call admin.signOut(userId, 'others') → revokes ALL other refresh tokens
 *      so old sessions cannot silently re-authenticate.
 *   5. Return the token to the client → stored in localStorage as 'mandi_active_token'.
 *
 * Detection on old sessions (polling every 30s):
 *   - Client calls supabase.auth.getUser() which validates the JWT server-side.
 *   - If token was revoked → getUser() returns an auth error → sign out.
 *   - If token is valid → compare user_metadata.active_session_token with localStorage.
 *   - Mismatch → another device has logged in → sign out gracefully.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Service-role client — bypasses RLS, can call Admin Auth API
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
})

export async function POST(request: NextRequest) {
    try {
        // ── 1. Extract & validate the bearer token ────────────────────────────
        const authHeader = request.headers.get('Authorization')
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 })
        }
        const accessToken = authHeader.slice(7)

        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken)
        if (userError || !user) {
            console.error('[new-session] Token validation failed:', userError?.message)
            return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
        }

        const userId = user.id
        const newSessionToken = crypto.randomUUID()

        // ── 2. Write token to user_metadata (NO migration required) ──────────
        // user_metadata is built into Supabase Auth — always exists.
        // The polling check on all open sessions reads this and compares.
        const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            user_metadata: {
                ...user.user_metadata,          // Preserve any existing metadata
                active_session_token: newSessionToken,
                active_session_at: new Date().toISOString(),
            }
        })

        if (metaError) {
            console.error('[new-session] Failed to update user_metadata:', metaError.message)
            // Still continue — JWT revocation below will still work
        }

        // ── 3. Revoke ALL other sessions at the JWT level ─────────────────────
        // This physically invalidates the refresh tokens of all other browsers/devices.
        // They will fail their next token refresh (within 1 hour max) and be signed out.
        const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(
            userId,
            'others'    // Revoke all sessions EXCEPT this one
        )

        if (signOutError) {
            // Only a warning — this fails benignly when user has no other sessions
            console.warn('[new-session] admin.signOut(others) note:', signOutError.message)
        }

        console.log(`[new-session] ✅ Session enforced for user ${userId.slice(0, 8)}. Token: ${newSessionToken.slice(0, 8)}...`)
        return NextResponse.json({ session_token: newSessionToken }, { status: 200 })

    } catch (err: any) {
        console.error('[new-session] Unexpected error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
