/**
 * GET /api/mandi/reports/ledger
 *
 * Party Ledger Report — running balance for a single contact (buyer, seller, farmer).
 * Combines:
 *   - Purchase bills (debit to party)
 *   - Sales invoices (credit from party)
 *   - Payments made / received
 *   - Commission / advance adjustments
 *
 * Returns chronologically sorted entries with opening and closing balance.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createMandiServerClient, requireAuth, apiError } from '../../_lib/server-client'

interface LedgerEntry {
    id: string
    entry_date: string
    debit: number | null
    credit: number | null
    narration: string | null
    reference_type: string | null
    reference_id: string | null
}

export async function GET(request: NextRequest) {
    const supabase = createMandiServerClient()
    const { profile, response: authErr } = await requireAuth(supabase)
    if (authErr) return authErr

    const { searchParams } = new URL(request.url)
    const partyId = searchParams.get('party_id')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')

    if (!partyId) return apiError.validation(['party_id is required'])
    if (!dateFrom || !dateTo) return apiError.validation(['date_from and date_to are required'])

    // Compute opening balance BEFORE date_from using the same ledger
    const { data: openingRows } = await supabase
        .schema('mandi')
        .from('ledger')
        .select('debit, credit')
        .eq('contact_id', partyId)
        .lt('entry_date', dateFrom)

    const openingBalance = (openingRows ?? []).reduce((acc, row) => {
        const r = row as unknown as LedgerEntry
        return acc + Number(r.debit ?? 0) - Number(r.credit ?? 0)
    }, 0)

    // Fetch period entries
    const { data: entries, error } = await supabase
        .schema('mandi')
        .from('ledger')
        .select(`
            id, entry_date, debit, credit, narration, reference_type, reference_id, created_at,
            account:accounts(id, name, type)
        `)
        .eq('contact_id', partyId)
        .gte('entry_date', dateFrom)
        .lte('entry_date', dateTo)
        .order('entry_date', { ascending: true })
        .order('created_at', { ascending: true })

    if (error) {
        console.error('[reports/ledger:GET]', error.message)
        return apiError.server(error.message)
    }

    const periodEntries = (entries ?? []) as unknown as LedgerEntry[]

    // Compute running balance + closing balance
    let runningBalance = openingBalance
    const entriesWithBalance = periodEntries.map(entry => {
        runningBalance += Number(entry.debit ?? 0) - Number(entry.credit ?? 0)
        return { ...entry, running_balance: runningBalance }
    })
    const closingBalance = runningBalance

    // Fetch party details
    const { data: party } = await supabase
        .schema('mandi')
        .from('contacts')
        .select('id, name, contact_type, phone, address, opening_balance')
        .eq('id', partyId)
        .single()

    return NextResponse.json({
        party: party ?? null,
        date_from: dateFrom,
        date_to: dateTo,
        opening_balance: Math.round(openingBalance * 100) / 100,
        closing_balance: Math.round(closingBalance * 100) / 100,
        entries: entriesWithBalance,
        count: entriesWithBalance.length,
    })
}
