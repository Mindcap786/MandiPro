/**
 * GET /api/mandi/sales/[id]   — single sale with items, buyer, lots joined
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
    .from('sales')
    .select(`
      *,
      buyer:contacts(id, name, contact_type, phone, address, gstin),
      items:sale_items(
        id, quantity, rate_per_unit, gross_amount, discount_amount,
        lot:lots(id, lot_code, grade, unit,
          arrival:arrivals(id, arrival_date,
            commodity:commodities(id, name, default_unit)
          )
        )
      )
    `)
    .eq('id', params.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return apiError.notFound('Sale')
    console.error('[sales/[id]:GET]', error.message)
    return apiError.server(error.message)
  }

  if ((data as unknown as { organization_id: string }).organization_id !== profile!.organization_id) {
    return apiError.forbidden()
  }

  return NextResponse.json(data)
}
