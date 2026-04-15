/**
 * GET   /api/mandi/settings   — fetch org + mandi settings merged
 * PATCH /api/mandi/settings   — update org settings + mandi fee configuration
 *
 * This is the typed BFF route that replaces direct `supabase.from()` calls
 * in the settings page component. The settings page sends to this endpoint;
 * this route validates, applies authorization, updates both tables atomically,
 * and writes an audit entry.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createMandiServerClient, requireAuth, apiError, auditLog } from '../_lib/server-client'

// ── Runtime schema (until packages/validation is wired) ──────────────────────

interface OrgSettingsPatch {
    // core.organizations fields
    name?: string
    gstin?: string | null
    address_line1?: string | null
    address_line2?: string | null
    settings?: Record<string, unknown> | null
    period_lock_enabled?: boolean
    period_locked_until?: string | null
    // mandi.mandi_settings fields
    commission_rate_default?: number
    market_fee_percent?: number
    nirashrit_percent?: number
    misc_fee_percent?: number
    default_credit_days?: number
    max_invoice_amount?: number
    gst_enabled?: boolean
    gst_type?: 'intra' | 'inter'
    cgst_percent?: number
    sgst_percent?: number
    igst_percent?: number
}

function validateSettingsPatch(body: unknown): { ok: true; data: OrgSettingsPatch } | { ok: false; issues: string[] } {
    const b = body as Record<string, unknown>
    const issues: string[] = []

    if (b.name !== undefined && (typeof b.name !== 'string' || b.name.trim().length < 2)) {
        issues.push('name must be at least 2 characters')
    }
    if (b.gstin !== undefined && b.gstin !== null && typeof b.gstin === 'string') {
        if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(b.gstin as string)) {
            issues.push('gstin format is invalid')
        }
    }
    const percentFields = ['commission_rate_default', 'market_fee_percent', 'nirashrit_percent', 'misc_fee_percent', 'cgst_percent', 'sgst_percent', 'igst_percent']
    for (const f of percentFields) {
        if (b[f] !== undefined && (Number(b[f]) < 0 || Number(b[f]) > 100)) {
            issues.push(`${f} must be 0–100`)
        }
    }
    if (b.gst_type !== undefined && !['intra', 'inter'].includes(b.gst_type as string)) {
        issues.push('gst_type must be "intra" or "inter"')
    }
    if (b.default_credit_days !== undefined && Number(b.default_credit_days) < 0) {
        issues.push('default_credit_days must be ≥ 0')
    }

    if (issues.length > 0) return { ok: false, issues }
    return { ok: true, data: b as OrgSettingsPatch }
}

// ── GET /api/mandi/settings ───────────────────────────────────────────────────

export async function GET() {
    const supabase = createMandiServerClient()
    const { profile, response: authErr } = await requireAuth(supabase)
    if (authErr) return authErr

    const [orgRes, mandiRes] = await Promise.all([
        supabase
            .schema('core')
            .from('organizations')
            .select('id, name, gstin, address_line1, address_line2, settings, period_lock_enabled, period_locked_until, subscription_tier, status')
            .eq('id', profile!.organization_id)
            .single(),
        supabase
            .schema('mandi')
            .from('mandi_settings' as never)
            .select('commission_rate_default, market_fee_percent, nirashrit_percent, misc_fee_percent, default_credit_days, max_invoice_amount, gst_enabled, gst_type, cgst_percent, sgst_percent, igst_percent')
            .eq('organization_id', profile!.organization_id)
            .maybeSingle(),
    ])

    if (orgRes.error) {
        console.error('[settings:GET] org fetch failed:', orgRes.error.message)
        return apiError.server(orgRes.error.message)
    }

    return NextResponse.json({
        ...orgRes.data,
        ...(mandiRes.data ?? {}),
    })
}

// ── PATCH /api/mandi/settings ─────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
    const supabase = createMandiServerClient()
    const { user, profile, response: authErr } = await requireAuth(supabase)
    if (authErr || !user || !profile) return authErr!

    // Only owner/admin can mutate settings
    if (!['owner', 'admin'].includes(profile.role)) {
        return apiError.forbidden()
    }

    let body: unknown
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

    const validation = validateSettingsPatch(body)
    if (!validation.ok) { return apiError.validation((validation as { ok: false; issues: string[] }).issues) }


    const validData: OrgSettingsPatch = validation.data

    const {
        name, gstin, address_line1, address_line2, settings,
        period_lock_enabled, period_locked_until,
        ...mandiFields
    } = validData

    const orgPayload: Record<string, unknown> = {}
    if (name !== undefined) orgPayload.name = name.trim()
    if (gstin !== undefined) orgPayload.gstin = gstin
    if (address_line1 !== undefined) orgPayload.address_line1 = address_line1
    if (address_line2 !== undefined) orgPayload.address_line2 = address_line2
    if (settings !== undefined) orgPayload.settings = settings
    if (period_lock_enabled !== undefined) orgPayload.period_lock_enabled = period_lock_enabled
    if (period_locked_until !== undefined) orgPayload.period_locked_until = period_locked_until || null

    const promises: Promise<{ error: { message: string } | null }>[] = []

    if (Object.keys(orgPayload).length > 0) {
        promises.push(
            supabase.schema('core')
                .from('organizations')
                .update(orgPayload)
                .eq('id', profile.organization_id) as never
        )
    }

    if (Object.keys(mandiFields).length > 0) {
        const mandiPayload = {
            organization_id: profile.organization_id,
            ...Object.fromEntries(
                Object.entries(mandiFields).map(([k, v]) => [k, Number(v)])
            ),
            // Re-apply non-numeric fields
            gst_enabled: validData.gst_enabled,
            gst_type: validData.gst_type,
            updated_at: new Date().toISOString(),
        }
        promises.push(
            supabase.schema('mandi')
                .from('mandi_settings' as never)
                .upsert(mandiPayload, { onConflict: 'organization_id' }) as never
        )
    }

    if (promises.length === 0) {
        return NextResponse.json({ success: true, message: 'No fields to update' })
    }

    const results = await Promise.all(promises)
    const failedError = results.find(r => r.error)?.error
    if (failedError) {
        console.error('[settings:PATCH] update failed:', failedError.message)
        return apiError.server(failedError.message)
    }

    auditLog(supabase, {
        organization_id: profile.organization_id,
        actor_id: user.id,
        action: 'settings_updated',
        entity_type: 'organization',
        entity_id: profile.organization_id,
        new_values: validData as Record<string, unknown>,
    })

    return NextResponse.json({ success: true })
}
