/**
 * POST /api/mandi/cheques/[id]/transition
 *
 * Enforces the cheque state machine server-side.
 * The domain logic (valid transitions) lives in the client-importable
 * packages/domain/finance/cheque-state-machine.ts — this route
 * re-validates the transition before delegating to the DB RPC.
 *
 * Valid transitions:
 *   pending   → presented | cancelled
 *   presented → cleared | bounced | cancelled
 *   cleared   → (terminal)
 *   bounced   → cancelled
 *   cancelled → (terminal)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createMandiServerClient, requireAuth, apiError, auditLog } from '../../../_lib/server-client'

type ChequeStatus = 'pending' | 'presented' | 'cleared' | 'bounced' | 'cancelled'

const VALID_TRANSITIONS: Record<ChequeStatus, ChequeStatus[]> = {
    pending:   ['presented', 'cancelled'],
    presented: ['cleared', 'bounced', 'cancelled'],
    cleared:   [],
    bounced:   ['cancelled'],
    cancelled: [],
}

function canTransition(current: ChequeStatus, next: ChequeStatus): boolean {
    return VALID_TRANSITIONS[current]?.includes(next) ?? false
}

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const supabase = createMandiServerClient()
    const { user, profile, response: authErr } = await requireAuth(supabase)
    if (authErr || !user || !profile) return authErr!

    // Only owner/admin/manager can transition cheques
    if (!['owner', 'admin', 'manager'].includes(profile.role)) {
        return apiError.forbidden()
    }

    let body: Record<string, unknown>
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

    const nextStatus = body.next_status as ChequeStatus
    if (!nextStatus || !Object.keys(VALID_TRANSITIONS).includes(nextStatus)) {
        return apiError.validation(['next_status must be pending | presented | cleared | bounced | cancelled'])
    }

    // Fetch current cheque state
    const { data: cheque, error: fetchErr } = await supabase
        .schema('mandi')
        .from('cheques')
        .select('id, status, amount, party_id, organization_id')
        .eq('id', params.id)
        .single()

    if (fetchErr || !cheque) return apiError.notFound('Cheque')

    const ch = cheque as unknown as { id: string; status: ChequeStatus; amount: number; party_id: string; organization_id: string }

    // Ownership check
    if (ch.organization_id !== profile.organization_id) return apiError.forbidden()

    // State machine enforcement — this same logic is in packages/domain for client use
    if (!canTransition(ch.status, nextStatus)) {
        return apiError.conflict(
            `Invalid cheque transition: ${ch.status} → ${nextStatus}. ` +
            `Allowed transitions from ${ch.status}: ${VALID_TRANSITIONS[ch.status].join(', ') || 'none'}`
        )
    }

    // Delegate to atomic RPC that updates cheque + posts ledger entry + writes audit
    const { data, error } = await supabase.schema('mandi').rpc('transition_cheque_with_ledger', {
        p_cheque_id: params.id,
        p_next_status: nextStatus,
        p_cleared_date: body.cleared_date ?? null,
        p_bounce_reason: body.bounce_reason ?? null,
        p_actor_id: user.id,
    } as never)

    if (error) {
        console.error('[cheques/transition:POST]', error.message)
        return apiError.server(error.message)
    }

    auditLog(supabase, {
        organization_id: profile.organization_id,
        actor_id: user.id,
        action: `cheque_${nextStatus}`,
        entity_type: 'cheque',
        entity_id: params.id,
        old_values: { status: ch.status },
        new_values: {
            status: nextStatus,
            cleared_date: body.cleared_date ?? null,
            bounce_reason: body.bounce_reason ?? null,
        },
    })

    return NextResponse.json({ success: true, cheque_id: params.id, new_status: nextStatus, data })
}
