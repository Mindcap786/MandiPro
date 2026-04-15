import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Use Service Role to bypass RLS for counting users accurately
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
)

export async function POST(req: Request) {
    try {
        const { joinCode, email, orgId, platform } = await req.json()
        const identifier = joinCode || email || orgId

        if (!identifier) {
            return NextResponse.json({ error: 'Missing identifier (joinCode, email, or orgId)' }, { status: 400 })
        }

        // Find organization by join code or search for the user's current organization
        let query = supabaseAdmin
            .schema('core')
            .from('organizations')
            .select('id, name, subscription_tier, max_web_users, max_mobile_users, max_total_users, join_code')

        if (joinCode) {
            query = query.eq('join_code', joinCode.trim())
        } else if (orgId) {
            query = query.eq('id', orgId)
        } else {
            // Identifier is likely the org_id (passed as 'id' or 'email' in some flows)
            query = query.eq('id', identifier)
        }

        const { data: organization, error: orgError } = await query.single()

        if (orgError || !organization) {
            console.error('[Check Limit] Org not found for:', identifier, orgError)
            return NextResponse.json({ error: joinCode ? 'Invalid Join Code' : 'Organization not found' }, { status: 404 })
        }

        // Count employees with access flags as the single source of truth.
        // Avoids double-counting employees who also have a core.profiles record.
        const { data: employees, error: empError } = await supabaseAdmin
            .schema('mandi')
            .from('employees')
            .select('is_web_user, is_mobile_user')
            .eq('organization_id', organization.id)
            .eq('status', 'active')

        if (empError) {
            console.warn('[Check Limit] Failed to fetch employees', empError)
        }

        const currentWebCount = employees?.filter(e => e.is_web_user).length ?? 0
        const currentMobileCount = employees?.filter(e => e.is_mobile_user).length ?? 0
        const currentTotalCount = currentWebCount + currentMobileCount

        
        // Limits: null = unlimited, 0 = zero allowed, N = N allowed
        const totalLimit = organization.max_total_users || 1
        const webLimit = organization.max_web_users ?? null
        const mobileLimit = organization.max_mobile_users ?? null

        // Enforcement Rules:
        // 1. Must not exceed Total Pool
        const totalOk = currentTotalCount < totalLimit

        // 2. Individual caps (null means no cap set = unlimited)
        let platformOk = true
        if (platform === 'web' && webLimit !== null) {
            platformOk = currentWebCount < webLimit
        } else if (platform === 'app' && mobileLimit !== null) {
            platformOk = currentMobileCount < mobileLimit
        }
        
        const isAllowed = totalOk && platformOk

        return NextResponse.json({
            allowed: isAllowed,
            tier: organization.subscription_tier,
            limit: totalLimit,
            webLimit,
            mobileLimit,
            currentCount: currentTotalCount,
            currentWebCount,
            currentMobileCount,
            orgName: organization.name,
            platform,
            error: !totalOk ? 'Total plan limit reached' : (!platformOk ? `${platform === 'web' ? 'Web' : 'Mobile'} device limit reached` : null)
        })

    } catch (error: any) {
        console.error('Limit Check Error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
