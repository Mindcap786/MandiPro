/**
 * packages/validation/src/index.ts
 *
 * Zod schemas for all MandiPro domain entities.
 * Shared between web (API route validation) and mobile (form validation).
 *
 * Rule: These schemas are the authoritative source for field contracts.
 *       API routes that currently have inline validators should migrate to use these.
 */
import { z } from "zod"

// ── Shared primitives ─────────────────────────────────────────────────────────

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
export const uuid = z.string().uuid()
export const positiveNumber = z.coerce.number({ invalid_type_error: "Must be a number" }).positive("Must be > 0")
export const nonNegativeNumber = z.coerce.number().min(0, "Must be ≥ 0")
export const percentRange = z.coerce.number().min(0, "Min 0").max(100, "Max 100")

// ── GSTIN ─────────────────────────────────────────────────────────────────────

export const gstin = z.string()
  .regex(
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    "Invalid GSTIN format"
  )
  .or(z.literal(""))
  .or(z.null())
  .optional()

// ── Contacts ──────────────────────────────────────────────────────────────────

export const ContactTypeEnum = z.enum(['buyer', 'seller', 'farmer', 'supplier', 'broker', 'other'])

export const CreateContactSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  contact_type: ContactTypeEnum,
  phone: z.string().max(15).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  gstin,
  opening_balance: nonNegativeNumber.optional().default(0),
  credit_limit: nonNegativeNumber.optional().nullable(),
})

export type CreateContactDTO = z.infer<typeof CreateContactSchema>

// ── Arrivals ──────────────────────────────────────────────────────────────────

export const ArrivalTypeEnum = z.enum(['commission_farmer', 'commission_supplier', 'direct_purchase'])

export const CreateArrivalSchema = z.object({
  arrival_date: isoDate,
  party_id: uuid,
  commodity_id: uuid,
  arrival_type: ArrivalTypeEnum,
  lot_prefix: z.string().min(1, "Lot prefix required").max(20),
  num_lots: z.coerce.number().int().min(1, "At least 1 lot"),
  bags_per_lot: z.coerce.number().int().min(1, "At least 1 bag per lot"),
  gross_qty: positiveNumber,
  less_percent: percentRange.default(0),
  less_units: nonNegativeNumber.default(0),
  grade: z.string().optional().nullable(),
  commission_percent: percentRange.default(0),
  transport_amount: nonNegativeNumber.default(0),
  loading_amount: nonNegativeNumber.default(0),
  packing_amount: nonNegativeNumber.default(0),
  advance_amount: nonNegativeNumber.default(0),
  misc_expenses: z.array(z.object({
    label: z.string().min(1),
    amount: nonNegativeNumber,
  })).optional().default([]),
  gate_entry_id: uuid.optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
}).refine(
  data => new Date(data.arrival_date) <= new Date(),
  { message: "Arrival date cannot be in the future", path: ["arrival_date"] }
)

export type CreateArrivalDTO = z.infer<typeof CreateArrivalSchema>

// ── Sales ─────────────────────────────────────────────────────────────────────

export const PaymentModeEnum = z.enum(['cash', 'bank_transfer', 'cheque', 'upi', 'udhaar'])

export const SaleLineItemSchema = z.object({
  lot_id: uuid,
  quantity: positiveNumber,
  rate_per_unit: positiveNumber,
  discount_amount: nonNegativeNumber.optional().default(0),
})

export const CreateSaleSchema = z.object({
  sale_date: isoDate,
  buyer_id: uuid,
  items: z.array(SaleLineItemSchema).min(1, "At least one item required"),
  header_discount: nonNegativeNumber.optional().default(0),
  payment_mode: PaymentModeEnum,
  narration: z.string().max(500).optional().nullable(),
  cheque_number: z.string().optional().nullable(),
  cheque_date: isoDate.optional().nullable(),
  cheque_bank: z.string().optional().nullable(),
  bank_account_id: uuid.optional().nullable(),
  gst_enabled: z.boolean().optional().default(false),
}).superRefine((data, ctx) => {
  if (data.payment_mode === 'cheque' && !data.cheque_number) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Cheque number required", path: ["cheque_number"] })
  }
})

export type CreateSaleDTO = z.infer<typeof CreateSaleSchema>

// ── Payments ──────────────────────────────────────────────────────────────────

export const PaymentTypeEnum = z.enum(['payment', 'receipt'])
export const PaymentModeNoUdhaarEnum = z.enum(['cash', 'bank_transfer', 'cheque', 'upi'])

export const CreatePaymentSchema = z.object({
  payment_date: isoDate,
  payment_type: PaymentTypeEnum,
  party_id: uuid,
  account_id: uuid,
  amount: positiveNumber,
  payment_mode: PaymentModeNoUdhaarEnum,
  reference_number: z.string().max(100).optional().nullable(),
  cheque_id: uuid.optional().nullable(),
  sale_id: uuid.optional().nullable(),
  arrival_id: uuid.optional().nullable(),
  narration: z.string().max(500).optional().nullable(),
  idempotency_key: uuid,      // REQUIRED — caller must generate crypto.randomUUID()
}).superRefine((data, ctx) => {
  if (data.payment_mode === 'cheque' && !data.cheque_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "cheque_id required when payment_mode is cheque", path: ["cheque_id"] })
  }
})

export type CreatePaymentDTO = z.infer<typeof CreatePaymentSchema>

// ── Cheque Transition ─────────────────────────────────────────────────────────

export const ChequeStatusEnum = z.enum(['pending', 'presented', 'cleared', 'bounced', 'cancelled'])

export const ChequeTransitionSchema = z.object({
  next_status: ChequeStatusEnum,
  cleared_date: isoDate.optional().nullable(),
  bounce_reason: z.string().max(500).optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.next_status === 'cleared' && !data.cleared_date) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "cleared_date required when marking cleared", path: ["cleared_date"] })
  }
  if (data.next_status === 'bounced' && !data.bounce_reason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "bounce_reason required when marking bounced", path: ["bounce_reason"] })
  }
})

export type ChequeTransitionDTO = z.infer<typeof ChequeTransitionSchema>

// ── Settings ──────────────────────────────────────────────────────────────────

export const UpdateOrgSettingsSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  gstin,
  address_line1: z.string().max(200).optional().nullable(),
  address_line2: z.string().max(200).optional().nullable(),
  period_lock_enabled: z.boolean().optional(),
  period_locked_until: isoDate.optional().nullable(),
  commission_rate_default: percentRange.optional(),
  market_fee_percent: percentRange.optional(),
  nirashrit_percent: percentRange.optional(),
  misc_fee_percent: percentRange.optional(),
  default_credit_days: nonNegativeNumber.optional(),
  max_invoice_amount: nonNegativeNumber.optional(),
  gst_enabled: z.boolean().optional(),
  gst_type: z.enum(['intra', 'inter']).optional(),
  cgst_percent: percentRange.optional(),
  sgst_percent: percentRange.optional(),
  igst_percent: percentRange.optional(),
})

export type UpdateOrgSettingsDTO = z.infer<typeof UpdateOrgSettingsSchema>
