/**
 * GET /api/mandi/reports/pnl
 *
 * Trading P&L Report for the mandi.
 * Delegates to the `get_pnl_summary` RPC which aggregates:
 *   - Purchase side: arrivals, commission income, market fees
 *   - Sales side: sale invoices, buyer receivables
 *   - Expense side: transport, loading, packing, misc
 *   - Net profit by commodity
 */
import { NextRequest, NextResponse } from 'next/server'
import { createMandiServerClient, requireAuth, apiError } from '../../_lib/server-client'

export async function GET(request: NextRequest) {
    const supabase = createMandiServerClient()
    const { profile, response: authErr } = await requireAuth(supabase)
    if (authErr) return authErr

    // Only owner/admin/manager can view P&L
    if (!['owner', 'admin', 'manager'].includes(profile!.role)) {
        return apiError.forbidden()
    }

    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const commodityId = searchParams.get('commodity_id') ?? null
    const arrivalType = searchParams.get('arrival_type') ?? null

    if (!dateFrom || !dateTo) {
        return apiError.validation(['date_from and date_to are required'])
    }

    const { data, error } = await supabase.rpc('get_pnl_summary', {
        p_org_id: profile!.organization_id,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_commodity_id: commodityId,
        p_arrival_type: arrivalType,
    } as never)

    if (error) {
        console.error('[reports/pnl:GET]', error.message)
        return apiError.server(error.message)
    }

    return NextResponse.json(data)
}
