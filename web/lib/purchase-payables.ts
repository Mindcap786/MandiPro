const toNumber = (value: number | string | null | undefined) => Number(value) || 0;

export function getArrivalType(lot: any) {
    return lot?.arrival?.arrival_type || lot?.arrival_type || "direct";
}

export function calculateArrivalLevelExpenses(arrivalLike: any) {
    return (
        toNumber(arrivalLike?.hire_charges) +
        toNumber(arrivalLike?.hamali_expenses) +
        toNumber(arrivalLike?.other_expenses)
    );
}

export function calculateLotSettlementAmount(lot: any) {
    const qty = toNumber(lot?.initial_qty);
    const rate = toNumber(lot?.supplier_rate);
    const lessPercent = toNumber(lot?.less_percent);
    const otherCut = toNumber(lot?.farmer_charges);
    const isAdvanceCleared = 
        !lot?.advance_payment_mode || 
        ['cash', 'bank', 'upi', 'UPI/BANK'].includes(lot.advance_payment_mode) || 
        lot.advance_cheque_status === true;
        
    const advance = isAdvanceCleared ? toNumber(lot?.advance) : 0;
    const packingCost = toNumber(lot?.packing_cost);
    const loadingCost = toNumber(lot?.loading_cost);
    const transportShare = toNumber(lot?.transport_share);
    const arrivalType = getArrivalType(lot);

    const adjustedQty = qty - (qty * lessPercent) / 100 - toNumber(lot?.less_units);
    const baseAdjustedValue = adjustedQty * rate;
    const adjustedValue = baseAdjustedValue - otherCut;

    if (arrivalType === "direct") {
        return adjustedValue - advance;
    }

    const salesSum = Array.isArray(lot?.sale_items)
        ? lot.sale_items.reduce((sum: number, item: any) => sum + toNumber(item?.amount), 0)
        : 0;
    const effectiveGoodsValue = salesSum > 0 ? salesSum : baseAdjustedValue;
    const commissionAmount =
        (effectiveGoodsValue * toNumber(lot?.commission_percent)) / 100;
    const lotExpenses = packingCost + loadingCost + transportShare;

    return effectiveGoodsValue - commissionAmount - otherCut - lotExpenses - advance;
}

export function calculateArrivalSettlementAmount(lots: any[], arrivalLike?: any) {
    const lotTotal = (lots || []).reduce(
        (sum, lot) => sum + calculateLotSettlementAmount(lot),
        0
    );

    return lotTotal - calculateArrivalLevelExpenses(arrivalLike);
}

/**
 * Calculates the gross value of a lot (Before Advance deduction)
 */
export function calculateLotGrossValue(lot: any) {
    const qty = toNumber(lot?.initial_qty);
    const rate = toNumber(lot?.supplier_rate);
    const lessPercent = toNumber(lot?.less_percent);
    const otherCut = toNumber(lot?.farmer_charges);
    const packingCost = toNumber(lot?.packing_cost);
    const loadingCost = toNumber(lot?.loading_cost);
    const transportShare = toNumber(lot?.transport_share);
    const arrivalType = getArrivalType(lot);

    const adjustedQty = qty - (qty * lessPercent) / 100 - toNumber(lot?.less_units);
    const baseAdjustedValue = adjustedQty * rate;
    const adjustedValue = baseAdjustedValue - otherCut;

    if (arrivalType === "direct") {
        return adjustedValue;
    }

    const salesSum = Array.isArray(lot?.sale_items)
        ? lot.sale_items.reduce((sum: number, item: any) => sum + toNumber(item?.amount), 0)
        : 0;
    const effectiveGoodsValue = salesSum > 0 ? salesSum : baseAdjustedValue;
    const commissionAmount =
        (effectiveGoodsValue * toNumber(lot?.commission_percent)) / 100;
    const lotExpenses = packingCost + loadingCost + transportShare;

    return effectiveGoodsValue - commissionAmount - otherCut - lotExpenses;
}

/**
 * Calculates the gross value of an arrival (Before Advance deduction)
 */
export function calculateArrivalGrossValue(lots: any[], arrivalLike?: any) {
    const lotTotal = (lots || []).reduce(
        (sum, lot) => sum + calculateLotGrossValue(lot),
        0
    );

    return lotTotal - calculateArrivalLevelExpenses(arrivalLike);
}

/**
 * UNIFIED PAYMENT STATUS CALCULATION
 * Used across: Quick Purchase, Arrivals, Purchase Bills
 * 
 * Determines if a purchase lot is: PAID | PARTIAL | PENDING
 * 
 * Business Rules:
 * - Uncleared cheques don't count as payment
 * - Credit/UDHAAR always shows balance pending
 * - Uses EPSILON tolerance for floating-point comparison
 */
export function calculatePaymentStatus(
    lot: any
): 'paid' | 'partial' | 'pending' {
    const AMOUNT_EPSILON = 0.01;
    
    // Step 1: Calculate net bill amount
    const netBillAmount = calculateLotGrossValue(lot);
    
    // Step 2: Get advance paid amount
    const advancePaid = toNumber(lot?.advance);
    
    // Step 3: Check if payment was actually cleared
    // Uncleared cheques (advance_cheque_status=false) don't count
    const isPaymentCleared = 
        !lot?.advance_payment_mode || 
        ['cash', 'bank', 'upi', 'UPI/BANK'].includes(lot.advance_payment_mode) || 
        lot.advance_cheque_status === true;
    
    // Step 4: Calculate balance pending
    const effectivePaidAmount = isPaymentCleared ? advancePaid : 0;
    const balancePending = netBillAmount - effectivePaidAmount;
    
    // Step 5: Determine status based on balance
    if (Math.abs(balancePending) < AMOUNT_EPSILON) {
        return 'paid';
    } else if (balancePending > AMOUNT_EPSILON && effectivePaidAmount > AMOUNT_EPSILON) {
        return 'partial';
    } else {
        return 'pending';
    }
}

/**
 * Calculate exact balance amount pending
 * Returns 0 if balance is within EPSILON tolerance
 */
export function calculateBalancePending(lot: any): number {
    const AMOUNT_EPSILON = 0.01;
    
    const netBillAmount = calculateLotGrossValue(lot);
    
    const isPaymentCleared = 
        !lot?.advance_payment_mode || 
        ['cash', 'bank', 'upi', 'UPI/BANK'].includes(lot.advance_payment_mode) || 
        lot.advance_cheque_status === true;
    
    const effectivePaidAmount = isPaymentCleared ? toNumber(lot?.advance) : 0;
    const balance = netBillAmount - effectivePaidAmount;
    
    return Math.abs(balance) < AMOUNT_EPSILON ? 0 : balance;
}

/**
 * Get payment mode display label
 */
export function getPaymentModeLabel(mode: string | null | undefined): string {
    if (!mode) return 'Credit';
    
    const modeMap: Record<string, string> = {
        'cash': 'Cash',
        'bank': 'UPI/Bank',
        'upi': 'UPI',
        'upi_bank': 'UPI/Bank',
        'cheque': 'Cheque',
        'credit': 'Credit/Udhaar'
    };
    
    return modeMap[mode.toLowerCase()] || mode;
}

/**
 * Get payment status badge color
 */
export function getPaymentStatusColor(status: 'paid' | 'partial' | 'pending'): string {
    switch (status) {
        case 'paid':
            return 'bg-green-100 text-green-800';
        case 'partial':
            return 'bg-orange-100 text-orange-800';
        case 'pending':
            return 'bg-gray-100 text-gray-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
}

/**
 * Format payment info for display
 */
export function formatPaymentInfo(lot: any): {
    status: 'paid' | 'partial' | 'pending';
    balance: number;
    mode: string;
    cleared: boolean;
} {
    return {
        status: calculatePaymentStatus(lot),
        balance: calculateBalancePending(lot),
        mode: getPaymentModeLabel(lot?.advance_payment_mode),
        cleared: lot?.advance_cheque_status === true || lot?.advance_payment_mode !== 'cheque'
    };
}

