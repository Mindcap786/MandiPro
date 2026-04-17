import { supabase } from '@/lib/supabaseClient'

export interface BillConfig {
    merchant_id: string
    farmer_id: string
    lot_ids: string[]
    settlement_rate: number
}

export class BillingService {
    /**
     * THE "ONE-SHOT" BILL GENERATOR
     * Converts a batch of Raw Arrivals (Lots) into a Final Financial Bill.
     * Handles: Commission, Cuts, Logistics Deductions.
     */
    static async generateFarmerBill(config: BillConfig) {
        console.log(`[BillingEngine] Starting Bill Gen for Farmer: ${config.farmer_id}`)

        // 1. Fetch Lots Data
        const { data: lots, error } = await supabase
            .schema('mandi')
            .from('lots')
            .select('*')
            .in('id', config.lot_ids)

        if (error || !lots) throw new Error('Failed to fetch lots for billing')

        // 2. Calculate Totals
        let totalGrossWeight = 0
        let totalNetWeight = 0
        let totalGrossAmount = 0

        // Expenses
        let totalCommission = 0
        let totalHamali = 0
        let totalPacking = 0
        let totalAdvance = 0
        let totalOtherDeductions = 0

        const processedLots = lots.map(lot => {
            // A. Weight Logic
            const grossWt = Number(lot.total_weight) || 0
            let netWt = 0

            // PRIORITY: Use persisted Net Weight (Audit Proof)
            if (lot.net_weight !== undefined && lot.net_weight !== null) {
                netWt = Number(lot.net_weight)
            } else {
                // Fallback (Legacy Data)
                let weightLoss = 0
                if (lot.weight_loss_type === 'percent') {
                    weightLoss = grossWt * (Number(lot.weight_loss_value) || 0) / 100
                } else {
                    weightLoss = Number(lot.weight_loss_value) || 0
                }
                netWt = Math.max(0, grossWt - weightLoss)
            }

            // B. Revenue Logic
            // If settlement_rate is valid, use it. Else fall back to some default (or error)
            const rate = config.settlement_rate
            const grossAmt = netWt * rate

            // C. Expense Logic
            const commPercent = Number(lot.commission_percent) || 0
            const commAmt = (grossAmt * commPercent) / 100

            const advance = Number(lot.advance_paid) || 0
            const packing = Number(lot.packing_charge) || 0 // If per unit, logic needs Qty
            // Re-read packing: Is it total or per unit? 
            // UI Input was "Pack Chg/Unit". So:
            const packAmt = packing * (Number(lot.current_quantity) || 0)

            const hamali = Number(lot.hamali) || 0
            const hire = Number(lot.hire) || 0 // Usually debit to driver, but sometimes farmer pays? Assuming Farmer Debit for now if entered here.

            // Accumulators
            totalGrossWeight += grossWt
            totalNetWeight += netWt
            totalGrossAmount += grossAmt

            totalCommission += commAmt
            totalHamali += hamali
            totalPacking += packAmt
            totalAdvance += advance
            // totalOtherDeductions += hire 

            return {
                lot_id: lot.id,
                gross_weight: grossWt,
                net_weight: netWt,
                rate_applied: rate,
                gross_amount: grossAmt,
                deductions: {
                    commission: commAmt,
                    hamali,
                    packing: packAmt,
                    advance
                }
            }
        })

        // 3. Final Net Payable
        const totalDeductions = totalCommission + totalHamali + totalPacking + totalAdvance + totalOtherDeductions
        const netPayable = totalGrossAmount - totalDeductions

        // 4. Construct Bill Record
        const billRecord = {
            merchant_id: config.merchant_id,
            farmer_id: config.farmer_id,
            bill_date: new Date().toISOString(),
            total_gross_weight: totalGrossWeight,
            total_net_weight: totalNetWeight,
            settlement_rate: config.settlement_rate,
            gross_amount: totalGrossAmount,

            // Breakdowns
            commission_amount: totalCommission,
            total_deductions: totalDeductions,
            net_payable: netPayable,

            status: 'generated'
        }

        console.log('[BillingEngine] Bill Calculated:', billRecord)

        // 5. DB Transaction (Actual)
        // A. Insert Purchase Bill (Farmer Bill)
        const { data: invoice, error: invoiceError } = await supabase
            .schema('mandi')
            .from('purchase_bills')
            .insert({
                organization_id: config.merchant_id,
                contact_id: config.farmer_id,
                date: new Date().toISOString(),
                total_amount: netPayable,
                gross_amount: totalGrossAmount,
                commission_amount: totalCommission,
                deductions_amount: totalDeductions,
                status: 'paid'
            })
            .select()
            .single()

        if (invoiceError) throw new Error('Failed to create invoice: ' + invoiceError.message)

        // B. Update Lots
        const { error: lotError } = await supabase
            .schema('mandi')
            .from('lots')
            .update({ status: 'billed', purchase_bill_id: invoice.id })
            .in('id', config.lot_ids)

        if (lotError) throw new Error('Failed to update lots: ' + lotError.message)

        // C. Create Ledger Entry (Credit Farmer - AP)
        // 1. Voucher
        const { data: voucher, error: voucherError } = await supabase
            .schema('mandi')
            .from('vouchers')
            .insert({
                organization_id: config.merchant_id,
                date: new Date().toISOString(),
                type: 'purchase',
                voucher_no: Date.now(),
                narration: `Farmer Bill #${invoice.id.substring(0, 8)}`
            })
            .select()
            .single()

        if (voucherError) throw new Error('Voucher creation failed')

        // 2. Entries
        // Credit Farmer (Payable)
        await supabase.schema('mandi').from('ledger_entries').insert({
            organization_id: config.merchant_id,
            voucher_id: voucher.id,
            contact_id: config.farmer_id,
            credit: netPayable,
            debit: 0
        })

        // Debit Purchase Account (Expense)
        // (Simplified: Avoiding account lookup for now, assuming system creates balancing entry or we add explicit debit later)

        return { success: true, bill: billRecord, lots: processedLots, invoice_id: invoice.id }
    }
}
