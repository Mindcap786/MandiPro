/**
 * GET  /api/mandi/cheques   — list cheques with optional status filter
 */
import { NextRequest, NextResponse } from 'next/server'
import { createMandiServerClient, requireAuth, apiError } from '../_lib/server-client'

export type ChequeStatus = 'pending' | 'presented' | 'cleared' | 'bounced' | 'cancelled'

export async function GET(request: NextRequest) {
    const supabase = createMandiServerClient()
    const { profile, response: authErr } = await requireAuth(supabase)
    if (authErr) return authErr

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') as ChequeStatus | null
    const chequeType = searchParams.get('cheque_type') // 'issued' | 'received'
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '25'), 100)
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const from = (page - 1) * limit

    let query = supabase
        .schema('mandi')
        .from('cheques')
        .select(`
            id, cheque_number, bank_name, amount, cheque_date, cheque_type,
            status, cleared_date, bounce_reason, created_at,
            party:contacts(id, name, contact_type)
        `, { count: 'exact' })
        .order('cheque_date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, from + limit - 1)

    if (status) query = query.eq('status', status)
    if (chequeType) query = query.eq('cheque_type', chequeType)
    if (dateFrom) query = query.gte('cheque_date', dateFrom)
    if (dateTo) query = query.lte('cheque_date', dateTo)

    const { data, error, count } = await query

    if (error) {
        console.error('[cheques:GET]', error.message)
        return apiError.server(error.message)
    }

    return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit })
}
