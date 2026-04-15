/**
 * packages/domain/src/arrivals/commission-calculator.ts
 *
 * Commission agent mandi calculation engine.
 * Pure math — no React, no Supabase.
 * Same file used in both web form previews and mobile input flows.
 */

export interface ArrivalInputs {
    gross_qty: number
    less_percent: number            // e.g. 2.5 for 2.5%
    less_units: number              // absolute units to deduct
    commission_percent: number      // e.g. 5 for 5%
    transport_amount: number
    loading_amount: number
    packing_amount: number
    advance_amount: number
    misc_expenses: Array<{ label: string; amount: number }>
    market_fee_percent: number      // from org settings
    nirashrit_percent: number       // from org settings
    misc_fee_percent: number        // from org settings
}

export interface ArrivalCalculation {
    net_qty: number
    total_deductions_qty: number
    // Commission
    commission_amount: number
    market_fee_amount: number
    nirashrit_amount: number
    misc_fee_amount: number
    // Expenses
    transport_amount: number
    loading_amount: number
    packing_amount: number
    misc_expenses_total: number
    // Final
    total_expenses: number
    total_due_to_party: number  // advance already deducted from their bill
    advance_amount: number
    net_due_after_advance: number
}

export function calculateArrival(inputs: ArrivalInputs): ArrivalCalculation {
    const gross = Math.max(0, inputs.gross_qty)

    // Net quantity after deductions
    const lessQty = (gross * (inputs.less_percent / 100)) + inputs.less_units
    const netQty = Math.max(0, gross - lessQty)

    // Fees are applied on gross (standard mandi practice)
    // Commission + market fee are earned on the gross arrival amount
    // They get charged to the party separately — here we calculate amounts
    // for the bill preview (actual commodity rate comes when lot is sold)
    // For purchase bills: inputs are a placeholder until sale rate is known
    const baseRate = 0  // not known at arrival time; calculated at sale time

    // Commission (percent of sale proceeds — placeholder 0 at arrival)
    const commissionAmount = 0  // Filled in during sale confirmation
    const marketFee = 0         // Filled in during sale confirmation
    const nirashrit = 0         // Filled in during sale confirmation
    const miscFee = 0           // Filled in during sale confirmation

    // Fixed expenses are known at arrival time
    const miscExpensesTotal = inputs.misc_expenses.reduce((sum, e) => sum + Math.max(0, e.amount), 0)
    const totalExpenses = inputs.transport_amount + inputs.loading_amount +
        inputs.packing_amount + miscExpensesTotal

    // Due to party = expenses they owe (advance already paid, so net = total - advance)
    const totalDueToParty = totalExpenses
    const netDueAfterAdvance = Math.max(0, totalDueToParty - inputs.advance_amount)

    return {
        net_qty: round2(netQty),
        total_deductions_qty: round2(lessQty),
        commission_amount: round2(commissionAmount),
        market_fee_amount: round2(marketFee),
        nirashrit_amount: round2(nirashrit),
        misc_fee_amount: round2(miscFee),
        transport_amount: round2(inputs.transport_amount),
        loading_amount: round2(inputs.loading_amount),
        packing_amount: round2(inputs.packing_amount),
        misc_expenses_total: round2(miscExpensesTotal),
        total_expenses: round2(totalExpenses),
        total_due_to_party: round2(totalDueToParty),
        advance_amount: round2(inputs.advance_amount),
        net_due_after_advance: round2(netDueAfterAdvance),
    }
}

/**
 * Calculate the commission amounts after sale rate is known (for purchase bill).
 */
export interface SaleRateInputs extends ArrivalInputs {
    sale_rate_per_unit: number
    net_qty: number
}

export interface CommissionBillLine {
    gross_sale_value: number
    commission_amount: number
    market_fee_amount: number
    nirashrit_amount: number
    misc_fee_amount: number
    total_deductions: number
    net_payable_to_party: number
}

export function calculateCommissionBill(inputs: SaleRateInputs): CommissionBillLine {
    const grossSaleValue = inputs.net_qty * inputs.sale_rate_per_unit
    const commission = grossSaleValue * (inputs.commission_percent / 100)
    const marketFee = grossSaleValue * (inputs.market_fee_percent / 100)
    const nirashrit = grossSaleValue * (inputs.nirashrit_percent / 100)
    const miscFee = grossSaleValue * (inputs.misc_fee_percent / 100)

    const totalExpenses = inputs.transport_amount + inputs.loading_amount +
        inputs.packing_amount +
        inputs.misc_expenses.reduce((s, e) => s + e.amount, 0)

    const totalDeductions = commission + marketFee + nirashrit + miscFee + totalExpenses
    const netPayable = grossSaleValue - totalDeductions - inputs.advance_amount

    return {
        gross_sale_value: round2(grossSaleValue),
        commission_amount: round2(commission),
        market_fee_amount: round2(marketFee),
        nirashrit_amount: round2(nirashrit),
        misc_fee_amount: round2(miscFee),
        total_deductions: round2(totalDeductions),
        net_payable_to_party: round2(netPayable),
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
    return Math.round(n * 100) / 100
}
