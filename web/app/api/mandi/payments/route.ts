/**
 * GET  /api/mandi/payments   — paginated list of payments and receipts
 * POST /api/mandi/payments   — record a payment or receipt with idempotency
 *
 * Idempotency: client must send a UUID `idempotency_key` with every POST.
 * Duplicate key returns 409 with the original record — safe to retry.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createMandiServerClient, requireAuth, apiError, auditLog } from '../_lib/server-client'

// ── Types ─────────────────────────────────────────────────────────────────────

type PaymentType = 'payment' | 'receipt'
type PaymentMode = 'cash' | 'bank_transfer' | 'cheque' | 'upi'

interface PaymentPayload {
    payment_date: string
    payment_type: PaymentType
    party_id: string
    account_id: string
    amount: number
    payment_mode: PaymentMode
    reference_number?: string
    cheque_id?: string
    sale_id?: string
    arrival_id?: string
    narration?: string
    idempotency_key: string
}

// ── Runtime validation ────────────────────────────────────────────────────────

function validatePaymentPayload(body: unknown): { ok: true; data: PaymentPayload } | { ok: false; issues: string[] } {
    const b = body as Record<string, unknown>
    const issues: string[] = []

    if (!b.idempotency_key || typeof b.idempotency_key !== 'string') {
        issues.push('idempotency_key is required (UUID)')
    }
    if (!b.payment_date || typeof b.payment_date !== 'string') issues.push('payment_date is required')
    if (!b.payment_type || !['payment', 'receipt'].includes(b.payment_type as string)) {
        issues.push('payment_type must be "payment" or "receipt"')
    }
    if (!b.party_id || typeof b.party_id !== 'string') issues.push('party_id is required')
    if (!b.account_id || typeof b.account_id !== 'string') issues.push('account_id is required')
    if (!b.amount || Number(b.amount) <= 0) issues.push('amount must be > 0')
    if (!b.payment_mode || !['cash', 'bank_transfer', 'cheque', 'upi'].includes(b.payment_mode as string)) {
        issues.push('payment_mode must be cash | bank_transfer | cheque | upi')
    }
    if (b.payment_mode === 'cheque' && !b.cheque_id) {
        issues.push('cheque_id is required when payment_mode is cheque')
    }

    if (issues.length > 0) return { ok: false, issues }
    return { ok: true, data: b as unknown as PaymentPayload }
}

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

    if (!['owner', 'admin', 'manager', 'staff'].includes(profile.role)) {
        return apiError.forbidden()
    }

    let body: unknown
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

    const validation = validatePaymentPayload(body)
    if (!validation.ok) { return apiError.validation((validation as { ok: false; issues: string[] }).issues) }
    const payload: PaymentPayload = validation.data


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
