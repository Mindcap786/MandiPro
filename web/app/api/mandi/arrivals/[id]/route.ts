/**
 * GET  /api/mandi/arrivals/[id]   — single arrival with full lot detail
 * PATCH /api/mandi/arrivals/[id]  — update draft arrival (pre-lot-creation only)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createMandiServerClient, requireAuth, apiError } from '../../_lib/server-client'

export async function GET(
    _request: NextRequest,
    { params }: { params: { id: string } }
) {
    const supabase = createMandiServerClient()
    const { profile, response: authErr } = await requireAuth(supabase)
    if (authErr) return authErr

    const { data, error } = await supabase
        .schema('mandi')
        .from('arrivals')
        .select(`
            *,
            party:contacts(id, name, contact_type, phone, address, opening_balance),
            commodity:commodities(id, name, default_unit, shelf_life_days),
            gate_entry:gate_entries(id, entry_date, vehicle_number),
            lots(id, lot_code, initial_qty, current_qty, unit, grade, status)
        `)
        .eq('id', params.id)
        .single()

    if (error) {
        if (error.code === 'PGRST116') return apiError.notFound('Arrival')
        console.error('[arrivals/[id]:GET]', error.message)
        return apiError.server(error.message)
    }

    // Ownership check — RLS should handle but double-check at app layer for safety
    if ((data as unknown as { organization_id: string }).organization_id !== profile!.organization_id) {
        return apiError.forbidden()
    }

    return NextResponse.json(data)
}
