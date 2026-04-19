/**
 * GET  /api/mandi/sales       — paginated sale list
 * POST /api/mandi/sales       — create sale (delegates to confirm_sale_transaction RPC)
 */
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createMandiServerClient, requireAuth, apiError, auditLog, validateRole } from '../_lib/server-client'

import { CreateSaleSchema } from '@mandi-pro/validation'

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

  // Standardized role validation
  const { ok, response: accessErr } = validateRole(profile, ['manager', 'staff'])
  if (!ok) return accessErr!

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const result = CreateSaleSchema.safeParse(body)
  if (!result.success) {
    return apiError.validation(result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`))
  }
  const payload = result.data
  const items = payload.items

  // Validate stock availability atomically via RPC
  const { data, error } = await supabase.schema('mandi').rpc('confirm_sale_transaction', {
    p_organization_id: profile.organization_id,
    p_sale_date: payload.sale_date,
    p_buyer_id: payload.buyer_id,
    p_items: items.map(item => ({
      lot_id: item.lot_id,
      quantity: Number(item.quantity),
      rate_per_unit: Number(item.rate_per_unit),
      discount_amount: Number(item.discount_amount ?? 0),
    })),
    p_total_amount: Number(payload.total_amount ?? 0),
    p_header_discount: Number(payload.header_discount ?? 0),
    p_discount_percent: Number(payload.discount_percent ?? 0),
    p_discount_amount: Number(payload.header_discount ?? 0), // Use header_discount or specific amount if needed
    p_payment_mode: payload.payment_mode,
    p_narration: payload.narration ?? null,
    p_cheque_number: payload.cheque_number ?? null,
    p_cheque_date: payload.cheque_date ?? null,
    p_cheque_bank: payload.cheque_bank ?? null,
    p_bank_account_id: payload.bank_account_id ?? null,
    p_cheque_status: Boolean(payload.cheque_status),
    p_amount_received: Number(payload.amount_received ?? 0),
    p_due_date: payload.due_date ?? null,
    p_market_fee: Number(payload.market_fee ?? 0),
    p_nirashrit: Number(payload.nirashrit ?? 0),
    p_misc_fee: Number(payload.misc_fee ?? 0),
    p_loading_charges: Number(payload.loading_charges ?? 0),
    p_unloading_charges: Number(payload.unloading_charges ?? 0),
    p_other_expenses: Number(payload.other_expenses ?? 0),
    p_gst_enabled: Boolean(payload.gst_enabled),
    p_cgst_amount: Number(payload.cgst_amount ?? 0),
    p_sgst_amount: Number(payload.sgst_amount ?? 0),
    p_igst_amount: Number(payload.igst_amount ?? 0),
    p_gst_total: Number(payload.gst_total ?? 0),
    p_place_of_supply: payload.place_of_supply ?? null,
    p_buyer_gstin: payload.buyer_gstin ?? null,
    p_is_igst: Boolean(payload.is_igst),
    p_idempotency_key: payload.idempotency_key ?? crypto.randomUUID(),
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

  if (!data) {
    console.error('[sales:POST] confirm_sale_transaction returned null/undefined data')
    return apiError.server("Database returned empty response")
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
