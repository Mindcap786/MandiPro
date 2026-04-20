/**
 * GET /api/mandi/reports/daybook
 *
 * Day Book report — all financial activity for a given date (or date range).
 * Supports two modes:
 *   - cash   → cash account entries only
 *   - ledger → all ledger entries for the period
 *
 * Returns entries sorted chronologically with running balance totals.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createMandiServerClient, requireAuth, apiError } from '../../_lib/server-client'

export async function GET(request: NextRequest) {
    const supabase = createMandiServerClient()
    const { profile, response: authErr } = await requireAuth(supabase)
    if (authErr) return authErr

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const mode = (searchParams.get('mode') ?? 'all') as 'cash' | 'bank' | 'all'

    // Support single date OR date range
    const effectiveFrom = dateFrom ?? date
    const effectiveTo = dateTo ?? date

    if (!effectiveFrom) {
        return apiError.validation(['date or date_from is required'])
    }

    let query = supabase
        .schema('mandi')
        .from('ledger')
        .select(`
            id, entry_date, debit, credit, narration, reference_type, reference_id, created_at,
            account:accounts(id, name, type, subtype),
            contact:contacts(id, name, contact_type),
            voucher:vouchers(id, voucher_no, type, invoice_id, arrival_id)
        `)
        .order('entry_date', { ascending: true })
        .order('created_at', { ascending: true })

    if (effectiveFrom) query = query.gte('entry_date', effectiveFrom)
    if (effectiveTo) query = query.lte('entry_date', effectiveTo)

    // Mode filtering
    if (mode === 'cash') {
        // Filter to only cash account entries
        query = query.eq('account.subtype', 'cash')
    } else if (mode === 'bank') {
        query = query.eq('account.subtype', 'bank')
    }

    const { data, error } = await query

    if (error) {
        console.error('[reports/daybook:GET]', error.message)
        return apiError.server(error.message)
    }

    const entries = data ?? []

    // Compute totals
    const totals = entries.reduce(
        (acc, entry) => {
            const e = entry as unknown as { debit: number; credit: number }
            acc.total_debit += Number(e.debit ?? 0)
            acc.total_credit += Number(e.credit ?? 0)
            return acc
        },
        { total_debit: 0, total_credit: 0 }
    )

    return NextResponse.json({
        entries,
        totals: {
            total_debit: Math.round(totals.total_debit * 100) / 100,
            total_credit: Math.round(totals.total_credit * 100) / 100,
            net: Math.round((totals.total_debit - totals.total_credit) * 100) / 100,
        },
        date_from: effectiveFrom,
        date_to: effectiveTo,
        mode,
        count: entries.length,
    })
}
