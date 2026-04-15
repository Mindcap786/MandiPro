/**
 * GET  /api/mandi/sales       — paginated sale list
 * POST /api/mandi/sales       — create sale (delegates to confirm_sale_transaction RPC)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createMandiServerClient, requireAuth, apiError, auditLog } from '../_lib/server-client'

// ── Runtime validation ────────────────────────────────────────────────────────

function validateSalePayload(body: unknown): { ok: true; data: Record<string, unknown> } | { ok: false; issues: string[] } {
  const b = body as Record<string, unknown>
  const issues: string[] = []

  if (!b.sale_date || typeof b.sale_date !== 'string') issues.push('sale_date is required (YYYY-MM-DD)')
  if (!b.buyer_id || typeof b.buyer_id !== 'string') issues.push('buyer_id is required')
  if (!b.items || !Array.isArray(b.items) || (b.items as unknown[]).length === 0) issues.push('items array must have at least one lot')
  if (!b.payment_mode) issues.push('payment_mode is required')

  const validModes = ['cash', 'bank_transfer', 'cheque', 'upi', 'udhaar']
  if (b.payment_mode && !validModes.includes(b.payment_mode as string)) {
    issues.push(`payment_mode must be one of: ${validModes.join(', ')}`)
  }

  if (Array.isArray(b.items)) {
    ;(b.items as Record<string, unknown>[]).forEach((item, i) => {
      if (!item.lot_id) issues.push(`items[${i}].lot_id is required`)
      if (!item.quantity || Number(item.quantity) <= 0) issues.push(`items[${i}].quantity must be > 0`)
      if (!item.rate_per_unit || Number(item.rate_per_unit) <= 0) issues.push(`items[${i}].rate_per_unit must be > 0`)
    })
  }

  if (b.payment_mode === 'cheque' && !b.cheque_number) issues.push('cheque_number required when payment_mode is cheque')

  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, data: b }
}

// ── GET /api/mandi/sales ──────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const supabase = createMandiServerClient()
  const { profile, response: authErr } = await requireAuth(supabase)
  if (authErr) return authErr

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '25'), 100)
  const status = searchParams.get('status')
  const buyerId = searchParams.get('buyer_id')
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  const from = (page - 1) * limit

  let query = supabase
    .schema('mandi')
    .from('sales')
    .select(`
      id, sale_date, invoice_no, status, payment_status, payment_mode,
      subtotal, discount_amount, gst_amount, total_amount, paid_amount, balance_due,
      narration, created_at,
      buyer:contacts(id, name, contact_type, phone)
    `, { count: 'exact' })
    .order('sale_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (status) query = query.eq('status', status)
  if (buyerId) query = query.eq('buyer_id', buyerId)
  if (dateFrom) query = query.gte('sale_date', dateFrom)
  if (dateTo) query = query.lte('sale_date', dateTo)

  const { data, error, count } = await query
  if (error) {
    console.error('[sales:GET]', error.message)
    return apiError.server(error.message)
  }

  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit })
}

// ── POST /api/mandi/sales ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = createMandiServerClient()
  const { user, profile, response: authErr } = await requireAuth(supabase)
  if (authErr || !user || !profile) return authErr!

  if (!['owner', 'admin', 'manager', 'staff'].includes(profile.role)) {
    return apiError.forbidden()
  }

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const validation = validateSalePayload(body)
  if (!validation.ok) { return apiError.validation((validation as { ok: false; issues: string[] }).issues) }
  const payload: Record<string, unknown> = validation.data


  const items = payload.items as Array<{ lot_id: string; quantity: number; rate_per_unit: number; discount_amount?: number }>

  // Validate stock availability atomically via RPC
  const { data, error } = await supabase.rpc('confirm_sale_transaction', {
    p_organization_id: profile.organization_id,
    p_sale_date: payload.sale_date,
    p_buyer_id: payload.buyer_id,
    p_items: items.map(item => ({
      lot_id: item.lot_id,
      quantity: Number(item.quantity),
      rate_per_unit: Number(item.rate_per_unit),
      discount_amount: Number(item.discount_amount ?? 0),
    })),
    p_header_discount: Number(payload.header_discount ?? 0),
    p_payment_mode: payload.payment_mode,
    p_narration: payload.narration ?? null,
    p_cheque_number: payload.cheque_number ?? null,
    p_cheque_date: payload.cheque_date ?? null,
    p_cheque_bank: payload.cheque_bank ?? null,
    p_bank_account_id: payload.bank_account_id ?? null,
    p_gst_enabled: Boolean(payload.gst_enabled),
    p_created_by: user.id,
  } as never)

  if (error) {
    console.error('[sales:POST]', error.message)
    // Surface domain errors cleanly
    if (error.message.includes('INSUFFICIENT_STOCK')) {
      return apiError.conflict(`Insufficient stock: ${error.message}`)
    }
    if (error.message.includes('INVALID_LOT')) {
      return apiError.conflict(`Invalid lot reference: ${error.message}`)
    }
    return apiError.server(error.message)
  }

  auditLog(supabase, {
    organization_id: profile.organization_id,
    actor_id: user.id,
    action: 'sale_confirmed',
    entity_type: 'sale',
    entity_id: (data as Record<string, string>)?.sale_id,
    new_values: { buyer_id: payload.buyer_id, items: items.length, payment_mode: payload.payment_mode },
  })

  return NextResponse.json(data, { status: 201 })
}
