/**
 * packages/domain/src/sales/invoice-totals.ts
 *
 * Sale invoice calculation engine.
 * Pure math — no React, no Supabase.
 * Powers the live preview in the POS/Sale form and the final invoice PDF.
 */

export type GstType = 'intra' | 'inter'

export interface SaleLineItem {
  lot_id: string
  quantity: number
  rate_per_unit: number
  discount_amount?: number   // line-level discount
}

export interface SaleInvoiceInputs {
  items: SaleLineItem[]
  header_discount?: number    // invoice-level discount (applied after subtotal)
  gst_enabled: boolean
  gst_type: GstType
  cgst_percent: number        // only for intra
  sgst_percent: number        // only for intra
  igst_percent: number        // only for inter
}

export interface SaleLineResult {
  lot_id: string
  quantity: number
  rate_per_unit: number
  gross_amount: number
  line_discount: number
  net_amount: number
}

export interface SaleInvoiceTotals {
  lines: SaleLineResult[]
  subtotal: number            // sum of all gross_amounts (before discount)
  total_line_discounts: number
  header_discount: number
  taxable_amount: number      // subtotal - all discounts
  cgst_amount: number
  sgst_amount: number
  igst_amount: number
  total_gst: number
  total_amount: number        // taxable_amount + total_gst = final invoice amount
  rounded_total: number       // bank-rounding to nearest rupee
}

export function calculateSaleInvoice(inputs: SaleInvoiceInputs): SaleInvoiceTotals {
  // Line-level calculation
  const lines: SaleLineResult[] = inputs.items.map(item => {
    const gross = round2(item.quantity * item.rate_per_unit)
    const lineDisco = round2(item.discount_amount ?? 0)
    return {
      lot_id: item.lot_id,
      quantity: item.quantity,
      rate_per_unit: item.rate_per_unit,
      gross_amount: gross,
      line_discount: lineDisco,
      net_amount: round2(gross - lineDisco),
    }
  })

  const subtotal = round2(lines.reduce((s, l) => s + l.gross_amount, 0))
  const totalLineDiscounts = round2(lines.reduce((s, l) => s + l.line_discount, 0))
  const headerDiscount = round2(inputs.header_discount ?? 0)
  const taxableAmount = round2(subtotal - totalLineDiscounts - headerDiscount)

  // GST calculation
  let cgst = 0, sgst = 0, igst = 0
  if (inputs.gst_enabled && taxableAmount > 0) {
    if (inputs.gst_type === 'intra') {
      cgst = round2(taxableAmount * inputs.cgst_percent / 100)
      sgst = round2(taxableAmount * inputs.sgst_percent / 100)
    } else {
      igst = round2(taxableAmount * inputs.igst_percent / 100)
    }
  }

  const totalGst = round2(cgst + sgst + igst)
  const totalAmount = round2(taxableAmount + totalGst)
  const roundedTotal = Math.round(totalAmount)  // bank rounding

  return {
    lines,
    subtotal,
    total_line_discounts: totalLineDiscounts,
    header_discount: headerDiscount,
    taxable_amount: taxableAmount,
    cgst_amount: cgst,
    sgst_amount: sgst,
    igst_amount: igst,
    total_gst: totalGst,
    total_amount: totalAmount,
    rounded_total: roundedTotal,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Quick single-lot rate calculation (used in POS table rows).
 */
export function calculateLotTotal(qty: number, rate: number, discount = 0): {
  gross: number; net: number; discount: number
} {
  const gross = round2(qty * rate)
  const d = round2(discount)
  return { gross, net: round2(gross - d), discount: d }
}

/**
 * Format amount in Indian currency notation (lakhs/crores).
 */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 2
  }).format(amount)
}
