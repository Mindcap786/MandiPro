/**
 * GET  /api/mandi/payments   — paginated list of payments and receipts
 * POST /api/mandi/payments   — record a payment or receipt with idempotency
 *
 * Idempotency: client must send a UUID `idempotency_key` with every POST.
 * Duplicate key returns 409 with the original record — safe to retry.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createMandiServerClient, requireAuth, apiError, auditLog, validateRole } from '../_lib/server-client'

import { CreatePaymentSchema } from '@mandi-pro/validation'

// ── GET /api/mandi/payments ───────────────────────────────────────────────────

export async function GET(request: NextRequest) {
    const supabase = createMandiServerClient()
    const { profile, response: authErr } = await requireAuth(supabase)
    if (authErr) return authErr

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '25'), 100)
    const paymentType = searchParams.get('payment_type') // 'payment' | 'receipt' | null (all)
    const partyId = searchParams.get('party_id')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const from = (page - 1) * limit

    let query = supabase
        .schema('mandi')
        .from('payments')
        .select(`
            id, payment_date, payment_type, amount, payment_mode,
            reference_number, narration, idempotency_key, created_at,
            party:contacts(id, name, contact_type),
            account:accounts(id, name, type)
        `, { count: 'exact' })
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, from + limit - 1)

    if (paymentType) query = query.eq('payment_type', paymentType)
    if (partyId) query = query.eq('party_id', partyId)
    if (dateFrom) query = query.gte('payment_date', dateFrom)
    if (dateTo) query = query.lte('payment_date', dateTo)

    const { data, error, count } = await query

    if (error) {
        console.error('[payments:GET]', error.message)
        return apiError.server(error.message)
    }

    return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit })
}

// ── POST /api/mandi/payments ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    const supabase = createMandiServerClient()
    const { user, profile, response: authErr } = await requireAuth(supabase)
    if (authErr || !user || !profile) return authErr!

    // Standardized role validation
    const { ok, response: accessErr } = validateRole(profile, ['manager', 'staff'])
    if (!ok) return accessErr!

    const body = await request.json()
    const result = CreatePaymentSchema.safeParse(body)
    if (!result.success) {
        return apiError.validation(result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`))
    }
    const payload = result.data


    // Attempt insert — idempotency_key is UNIQUE so a duplicate returns a constraint error
    const { data, error } = await supabase
        .schema('mandi')
        .from('payments')
        .insert({
            organization_id: profile.organization_id,
            payment_date: payload.payment_date,
            payment_type: payload.payment_type,
            party_id: payload.party_id,
            account_id: payload.account_id,
            amount: payload.amount,
            payment_mode: payload.payment_mode,
            reference_number: payload.reference_number ?? null,
            cheque_id: payload.cheque_id ?? null,
            sale_id: payload.sale_id ?? null,
            arrival_id: payload.arrival_id ?? null,
            narration: payload.narration ?? null,
            idempotency_key: payload.idempotency_key,
            created_by: user.id,
        })
        .select()
        .single()

    if (error) {
        // Unique violation on idempotency_key → return 409 with safe message
        if (error.code === '23505') {
            const { data: existing } = await supabase
                .schema('mandi')
                .from('payments')
                .select('id, amount, payment_type, created_at')
                .eq('idempotency_key', payload.idempotency_key)
                .single()
            return apiError.conflict(
                `Duplicate payment — this idempotency_key was already used (payment id: ${(existing as Record<string, string>)?.id ?? 'unknown'})`
            )
        }
        console.error('[payments:POST]', error.message)
        return apiError.server(error.message)
    }

    auditLog(supabase, {
        organization_id: profile.organization_id,
        actor_id: user.id,
        action: payload.payment_type === 'receipt' ? 'receipt_recorded' : 'payment_recorded',
        entity_type: 'payment',
        entity_id: (data as Record<string, string>)?.id,
        new_values: { ...payload, organization_id: profile.organization_id },
    })

    return NextResponse.json(data, { status: 201 })
}
