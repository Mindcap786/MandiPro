/**
 * GET  /api/mandi/arrivals       — paginated list with party + commodity joins
 * POST /api/mandi/arrivals       — create arrival + lots atomically via RPC
 */
import { NextRequest, NextResponse } from 'next/server'
import { createMandiServerClient, requireAuth, apiError, auditLog } from '../_lib/server-client'

import { CreateArrivalSchema } from '@mandi-pro/validation'

// ── GET /api/mandi/arrivals ───────────────────────────────────────────────────

export async function GET(request: NextRequest) {
    const supabase = createMandiServerClient()
    const { profile, response: authErr } = await requireAuth(supabase)
    if (authErr) return authErr

    const { searchParams } = new URL(request.url)
    const filters: ArrivalListFilters = {
        page: parseInt(searchParams.get('page') ?? '1'),
        limit: Math.min(parseInt(searchParams.get('limit') ?? '25'), 100),
        date_from: searchParams.get('date_from') ?? undefined,
        date_to: searchParams.get('date_to') ?? undefined,
        party_id: searchParams.get('party_id') ?? undefined,
        commodity_id: searchParams.get('commodity_id') ?? undefined,
        status: searchParams.get('status') ?? undefined,
    }

    const from = ((filters.page ?? 1) - 1) * (filters.limit ?? 25)
    const to = from + (filters.limit ?? 25) - 1

    let query = supabase
        .schema('mandi')
        .from('arrivals')
        .select(`
            id, arrival_date, arrival_type, lot_prefix, num_lots,
            gross_qty, less_percent, less_units, net_qty,
            commission_percent, transport_amount, loading_amount,
            packing_amount, advance_amount, status, created_at,
            party:contacts(id, name, contact_type, phone),
            commodity:commodities(id, name, default_unit)
        `, { count: 'exact' })
        .order('arrival_date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to)

    if (filters.date_from) query = query.gte('arrival_date', filters.date_from)
    if (filters.date_to) query = query.lte('arrival_date', filters.date_to)
    if (filters.party_id) query = query.eq('party_id', filters.party_id)
    if (filters.commodity_id) query = query.eq('commodity_id', filters.commodity_id)
    if (filters.status) query = query.eq('status', filters.status)

    const { data, error, count } = await query

    if (error) {
        console.error('[arrivals:GET]', error.message)
        return apiError.server(error.message)
    }

    return NextResponse.json({
        data: data ?? [],
        total: count ?? 0,
        page: filters.page,
        limit: filters.limit,
    })
}

// ── POST /api/mandi/arrivals ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    const supabase = createMandiServerClient()
    const { user, profile, response: authErr } = await requireAuth(supabase)
    if (authErr || !user || !profile) return authErr!

    // Standardized role validation
    const { ok, response: accessErr } = validateRole(profile, ['manager', 'staff'])
    if (!ok) return accessErr!

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const result = CreateArrivalSchema.safeParse(body)
    if (!result.success) {
        return apiError.validation(result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`))
    }

    const payload = result.data

    // Delegate to transactional RPC — one atomic operation, no partial state possible
    const { data, error } = await supabase.rpc('create_mixed_arrival', {
        p_arrival: {
            ...payload,
            organization_id: profile.organization_id // injected server side
        },
        p_created_by: user.id,
    } as any)

    if (error) {
        console.error('[arrivals:POST]', error.message)
        return apiError.server(error.message)
    }

    // Attempt to post ledger automatically via RPC
    const arrivalData = data as any;
    if (arrivalData?.arrival_id) {
        const { error: ledgerError } = await supabase.rpc('post_arrival_ledger', {
            p_arrival_id: arrivalData.arrival_id
        });
        if (ledgerError) {
            console.error('[arrivals:POST] Ledger Post Failed:', ledgerError.message);
            // Non-fatal, admin can handle it
        }
    }

    // Audit (fire-and-forget — never block response)
    auditLog(supabase, {
        organization_id: profile.organization_id,
        actor_id: user.id,
        action: 'arrival_created',
        entity_type: 'arrival',
        entity_id: (data as Record<string, string>)?.arrival_id,
        new_values: payload,
    })

    return NextResponse.json(data, { status: 201 })
}
