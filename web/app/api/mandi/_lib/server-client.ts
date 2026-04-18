/**
 * /api/mandi/_lib/server-client.ts
 *
 * Shared server Supabase client factory for all /api/mandi/* routes.
 * Uses @supabase/ssr for correct cookie-based auth in Next.js App Router.
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export function createMandiServerClient() {
    const cookieStore = cookies()
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll() },
                // Route handlers are read-only for cookies — mutations handled by middleware
                setAll() {},
            },
        }
    )
}

/**
 * Validates the caller and returns their user + org profile.
 * Returns null + a 401 response if unauthenticated.
 */
export async function requireAuth(supabase: ReturnType<typeof createMandiServerClient>) {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
        return { user: null, profile: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    }

    const { data: profile, error: profileErr } = await supabase
        .schema('core')
        .from('profiles')
        .select('id, organization_id, role, full_name, business_domain')
        .eq('id', user.id)
        .single()

    if (profileErr || !profile) {
        return { user, profile: null, response: NextResponse.json({ error: 'Profile not found' }, { status: 404 }) }
    }

    return { user, profile, response: null }
}

/**
 * Robust role-based check for domain APIs.
 * Returns { ok: true } if allowed, or { ok: false, response: NextResponse } if blocked.
 */
export function validateRole(profile: { role?: string }, allowedRoles: string[]) {
    const role = profile?.role ?? 'authenticated';
    
    // Core ERP logic: owner and admin are ALWAYS allowed for all modules
    const extendedAllowed = Array.from(new Set(['owner', 'admin', ...allowedRoles]));
    
    if (!extendedAllowed.includes(role)) {
        console.warn(`[API:Auth] Action Blocked: User has role '${role}', but action requires one of [${extendedAllowed.join(', ')}]`);
        return { 
            ok: false, 
            response: NextResponse.json({ 
                error: 'Insufficient permissions', 
                detail: `Role '${role}' is not authorized for this action.` 
            }, { status: 403 }) 
        };
    }
    
    return { ok: true, response: null };
}

/**
 * Standard error response helpers
 */
export const apiError = {
    unauthorized: () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    forbidden: () => NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 }),
    notFound: (resource = 'Resource') => NextResponse.json({ error: `${resource} not found` }, { status: 404 }),
    validation: (issues: unknown) => NextResponse.json({ error: 'Validation failed', issues }, { status: 422 }),
    server: (msg: string) => NextResponse.json({ error: msg }, { status: 500 }),
    conflict: (msg: string) => NextResponse.json({ error: msg }, { status: 409 }),
}

/**
 * Append a fire-and-forget audit entry.
 * Never throws — always safe to call without await.
 */
export function auditLog(
    supabase: ReturnType<typeof createMandiServerClient>,
    entry: {
        organization_id: string
        actor_id: string
        action: string
        entity_type: string
        entity_id?: string
        old_values?: Record<string, unknown>
        new_values?: Record<string, unknown>
    }
) {
    Promise.resolve(
        supabase
            .schema('core')
            .from('audit_log' as never)
            .insert(entry)
    ).catch((e: Error) => console.warn('[audit_log] Failed to write:', e.message))
}

