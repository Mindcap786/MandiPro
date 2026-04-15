/**
 * GET /api/mandi/field-governance
 *
 * Returns the field visibility/required/label rules for a given module,
 * scoped to the calling user's organization and role.
 *
 * Query params:
 *   - module  (required) — e.g. 'arrivals', 'sales', 'payments', 'contacts'
 *
 * Response: { rules: FieldRule[], defaults_applied: boolean }
 * If no custom rules exist, returns system defaults so the UI always has config.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createMandiServerClient, requireAuth, apiError } from '../_lib/server-client'

// System defaults — ui falls back to these if no custom rules exist for a field
const MODULE_DEFAULTS: Record<string, Array<{
    field_name: string
    is_visible: boolean
    is_required: boolean
    custom_label: string | null
}>> = {
    arrivals: [
        { field_name: 'lot_prefix', is_visible: true, is_required: true, custom_label: null },
        { field_name: 'num_lots', is_visible: true, is_required: true, custom_label: null },
        { field_name: 'bags_per_lot', is_visible: true, is_required: true, custom_label: null },
        { field_name: 'gross_qty', is_visible: true, is_required: true, custom_label: null },
        { field_name: 'less_percent', is_visible: true, is_required: false, custom_label: null },
        { field_name: 'less_units', is_visible: true, is_required: false, custom_label: null },
        { field_name: 'grade', is_visible: true, is_required: false, custom_label: null },
        { field_name: 'transport_amount', is_visible: true, is_required: false, custom_label: null },
        { field_name: 'loading_amount', is_visible: true, is_required: false, custom_label: null },
        { field_name: 'packing_amount', is_visible: true, is_required: false, custom_label: null },
        { field_name: 'advance_amount', is_visible: true, is_required: false, custom_label: null },
        { field_name: 'misc_expenses', is_visible: true, is_required: false, custom_label: null },
        { field_name: 'commission_percent', is_visible: true, is_required: false, custom_label: null },
        { field_name: 'market_fee', is_visible: true, is_required: false, custom_label: null },
        { field_name: 'nirashrit', is_visible: true, is_required: false, custom_label: null },
    ],
    sales: [
        { field_name: 'buyer_id', is_visible: true, is_required: true, custom_label: null },
        { field_name: 'sale_date', is_visible: true, is_required: true, custom_label: null },
        { field_name: 'lots', is_visible: true, is_required: true, custom_label: null },
        { field_name: 'rate_per_unit', is_visible: true, is_required: true, custom_label: null },
        { field_name: 'discount_amount', is_visible: true, is_required: false, custom_label: null },
        { field_name: 'payment_mode', is_visible: true, is_required: true, custom_label: null },
        { field_name: 'cheque_details', is_visible: true, is_required: false, custom_label: null },
        { field_name: 'gst', is_visible: false, is_required: false, custom_label: null },
        { field_name: 'narration', is_visible: true, is_required: false, custom_label: null },
    ],
    payments: [
        { field_name: 'payment_date', is_visible: true, is_required: true, custom_label: null },
        { field_name: 'party_id', is_visible: true, is_required: true, custom_label: null },
        { field_name: 'amount', is_visible: true, is_required: true, custom_label: null },
        { field_name: 'payment_mode', is_visible: true, is_required: true, custom_label: null },
        { field_name: 'reference_number', is_visible: true, is_required: false, custom_label: null },
        { field_name: 'narration', is_visible: true, is_required: false, custom_label: null },
    ],
    contacts: [
        { field_name: 'name', is_visible: true, is_required: true, custom_label: null },
        { field_name: 'contact_type', is_visible: true, is_required: true, custom_label: null },
        { field_name: 'phone', is_visible: true, is_required: false, custom_label: null },
        { field_name: 'address', is_visible: true, is_required: false, custom_label: null },
        { field_name: 'gstin', is_visible: false, is_required: false, custom_label: null },
        { field_name: 'opening_balance', is_visible: true, is_required: false, custom_label: null },
        { field_name: 'credit_limit', is_visible: false, is_required: false, custom_label: null },
    ],
}

export async function GET(request: NextRequest) {
    const supabase = createMandiServerClient()
    const { profile, response: authErr } = await requireAuth(supabase)
    if (authErr) return authErr

    const { searchParams } = new URL(request.url)
    const module = searchParams.get('module')

    if (!module) return apiError.validation(['module query param is required'])

    // Fetch custom rules for this org + module
    const { data: customRules } = await supabase
        .schema('mandi')
        .from('field_governance_rules' as never)
        .select('field_name, is_visible, is_required, custom_label, applies_to_roles')
        .eq('organization_id', profile!.organization_id)
        .eq('module', module)

    const defaults = MODULE_DEFAULTS[module] ?? []
    const custom = (customRules ?? []) as Array<{
        field_name: string
        is_visible: boolean
        is_required: boolean
        custom_label: string | null
        applies_to_roles: string[]
    }>

    // Merge: custom rules override defaults
    const mergedMap = new Map(defaults.map(d => [d.field_name, { ...d, applies_to_roles: null }]))
    for (const rule of custom) {
        // Role-specific filtering: if rule applies_to_roles is set and doesn't include caller's role, skip
        if (rule.applies_to_roles?.length > 0 && !rule.applies_to_roles.includes(profile!.role)) continue
        mergedMap.set(rule.field_name, rule)
    }

    return NextResponse.json({
        module,
        rules: Array.from(mergedMap.values()),
        defaults_applied: custom.length === 0,
        count: mergedMap.size,
    })
}
