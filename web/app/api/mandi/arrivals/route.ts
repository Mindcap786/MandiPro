/**
 * GET  /api/mandi/arrivals       — paginated list with party + commodity joins
 * POST /api/mandi/arrivals       — create arrival + lots atomically via RPC
 */
import { NextRequest, NextResponse } from 'next/server'
import { createMandiServerClient, requireAuth, apiError, auditLog } from '../_lib/server-client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ArrivalListFilters {
    page?: number
    limit?: number
    date_from?: string
    date_to?: string
    party_id?: string
    commodity_id?: string
    status?: string
}

// Minimal Zod-like runtime guard (full Zod schema once packages/validation is set up)
function validateArrivalPayload(body: unknown): { ok: true; data: Record<string, unknown> } | { ok: false; issues: string[] } {
    const b = body as Record<string, unknown>
    const issues: string[] = []

    if (!b.arrival_date || typeof b.arrival_date !== 'string') issues.push('arrival_date is required (YYYY-MM-DD)')
    if (b.arrival_date && new Date(b.arrival_date as string) > new Date()) issues.push('arrival_date cannot be in the future')
    if (!b.party_id || typeof b.party_id !== 'string') issues.push('party_id is required')
    if (!b.commodity_id || typeof b.commodity_id !== 'string') issues.push('commodity_id is required')
    if (!b.arrival_type) issues.push('arrival_type is required')
    if (!['commission_farmer', 'commission_supplier', 'direct_purchase'].includes(b.arrival_type as string)) {
        issues.push('arrival_type must be commission_farmer | commission_supplier | direct_purchase')
    }
    if (!b.lot_prefix || typeof b.lot_prefix !== 'string') issues.push('lot_prefix is required')
    if (!b.num_lots || Number(b.num_lots) < 1) issues.push('num_lots must be ≥ 1')
    if (!b.bags_per_lot || Number(b.bags_per_lot) < 1) issues.push('bags_per_lot must be ≥ 1')
    if (!b.gross_qty || Number(b.gross_qty) <= 0) issues.push('gross_qty must be > 0')
    if (Number(b.commission_percent) < 0 || Number(b.commission_percent) > 25) {
        issues.push('commission_percent must be 0–25')
    }

    if (issues.length > 0) return { ok: false, issues }
    return { ok: true, data: b }
}

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

    // Permission check
    if (!['owner', 'admin', 'manager', 'staff'].includes(profile.role)) {
        return apiError.forbidden()
    }

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const validation = validateArrivalPayload(body)
    if (!validation.ok) return apiError.validation(validation.issues)

    const payload = validation.data

    // Delegate to transactional RPC — one atomic operation, no partial state possible
    const { data, error } = await supabase.rpc('create_arrival_with_lots', {
        p_arrival: {
            organization_id: profile.organization_id,
            arrival_date: payload.arrival_date,
            party_id: payload.party_id,
            commodity_id: payload.commodity_id,
            arrival_type: payload.arrival_type,
            lot_prefix: payload.lot_prefix,
            num_lots: Number(payload.num_lots),
            bags_per_lot: Number(payload.bags_per_lot),
            gross_qty: Number(payload.gross_qty),
            less_percent: Number(payload.less_percent ?? 0),
            less_units: Number(payload.less_units ?? 0),
            grade: payload.grade ?? null,
            commission_percent: Number(payload.commission_percent ?? 0),
            transport_amount: Number(payload.transport_amount ?? 0),
            loading_amount: Number(payload.loading_amount ?? 0),
            packing_amount: Number(payload.packing_amount ?? 0),
            advance_amount: Number(payload.advance_amount ?? 0),
            misc_expenses: payload.misc_expenses ?? [],
            gate_entry_id: payload.gate_entry_id ?? null,
            notes: payload.notes ?? null,
        },
        p_created_by: user.id,
    } as never)

    if (error) {
        console.error('[arrivals:POST]', error.message)
        return apiError.server(error.message)
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
