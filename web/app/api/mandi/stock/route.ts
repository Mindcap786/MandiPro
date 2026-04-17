/**
 * GET /api/mandi/stock   — live stock status across all lots
 *
 * Returns commodity-level stock summary with lot breakdowns.
 * Read-only — stock mutations only happen via arrivals (creation) and sales (deduction).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createMandiServerClient, requireAuth, apiError } from '../_lib/server-client'

export async function GET(request: NextRequest) {
    const supabase = createMandiServerClient()
    const { profile, response: authErr } = await requireAuth(supabase)
    if (authErr) return authErr

    const { searchParams } = new URL(request.url)
    const commodityId = searchParams.get('commodity_id')
    const status = searchParams.get('status') ?? 'available,partial'   // default: show only live stock
    const includeEmpty = searchParams.get('include_empty') === 'true'

    const statusList = status.split(',').map(s => s.trim())

    let query = supabase
        .schema('mandi')
        .from('lots')
        .select(`
            id, lot_code, initial_qty, current_qty, unit, grade, status, created_at,
            commodity:commodities(id, name, default_unit, shelf_life_days, critical_age_days),
            arrival:arrivals(id, arrival_date, arrival_type, party:contacts(id, name))
        `)
        .in('status', statusList)
        .order('created_at', { ascending: false })

    if (commodityId) query = query.eq('commodity_id', commodityId)
    if (!includeEmpty) query = query.gt('current_qty', 0)

    const { data, error } = await query

    if (error) {
        console.error('[stock:GET]', error.message)
        return apiError.server(error.message)
    }

    // Aggregate by commodity for summary view
    const summary = buildStockSummary((data ?? []) as unknown as LotRow[])

    return NextResponse.json({ lots: data ?? [], summary })
}

interface LotRow {
    id: string
    lot_code: string
    current_qty: number
    initial_qty: number
    unit: string
    grade: string | null
    status: string
    created_at: string
    commodity: { id: string; name: string; default_unit: string; shelf_life_days: number | null; critical_age_days: number | null } | null
}

function buildStockSummary(lots: LotRow[]) {
    const byCommodity: Record<string, {
        commodity_id: string
        commodity_name: string
        total_lots: number
        available_lots: number
        total_qty: number
        aging_lots: number
        critical_lots: number
    }> = {}

    const now = Date.now()

    for (const lot of lots) {
        const cid = lot.commodity?.id ?? 'unknown'
        if (!byCommodity[cid]) {
            byCommodity[cid] = {
                commodity_id: cid,
                commodity_name: lot.commodity?.name ?? 'Unknown',
                total_lots: 0,
                available_lots: 0,
                total_qty: 0,
                aging_lots: 0,
                critical_lots: 0,
            }
        }

        const entry = byCommodity[cid]
        entry.total_lots++
        if (lot.status === 'available') entry.available_lots++
        entry.total_qty += Number(lot.current_qty)

        // Aging calculation
        const ageMs = now - new Date(lot.created_at).getTime()
        const ageDays = ageMs / 86_400_000
        const shelfLife = lot.commodity?.shelf_life_days ?? Infinity
        const criticalAge = lot.commodity?.critical_age_days ?? Infinity
        if (ageDays > criticalAge) entry.critical_lots++
        else if (ageDays > shelfLife) entry.aging_lots++
    }

    return Object.values(byCommodity).sort((a, b) => b.total_qty - a.total_qty)
}
