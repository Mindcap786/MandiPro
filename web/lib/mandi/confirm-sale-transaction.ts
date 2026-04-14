import { supabase } from "@/lib/supabaseClient";

type ConfirmSaleTransactionParams = {
    organizationId: string;
    buyerId: string | null;
    saleDate: string;
    paymentMode: string;
    totalAmount: number;
    items: any[];
    marketFee?: number;
    nirashrit?: number;
    miscFee?: number;
    loadingCharges?: number;
    unloadingCharges?: number;
    otherExpenses?: number;
    idempotencyKey?: string | null;
    dueDate?: string | null;
    bankAccountId?: string | null;
    chequeNo?: string | null;
    chequeDate?: string | null;
    chequeStatus?: boolean;
    amountReceived?: number | null;
    bankName?: string | null;
    cgstAmount?: number;
    sgstAmount?: number;
    igstAmount?: number;
    gstTotal?: number;
    discountPercent?: number;
    discountAmount?: number;
    placeOfSupply?: string | null;
    buyerGstin?: string | null;
    isIgst?: boolean;
};

type ConfirmSaleTransactionResult = {
    data: any;
    error: any;
    usedLegacyFallback: boolean;
    warning?: string;
};

const isAmbiguousConfirmSaleError = (message: string | undefined) =>
    !!message &&
    message.includes("Could not choose the best candidate function between") &&
    message.includes("confirm_sale_transaction");

const isPaidSale = (paymentMode: string, chequeStatus: boolean) =>
    ["cash", "upi", "bank_transfer", "UPI/BANK", "bank_upi"].includes(paymentMode) ||
    (paymentMode === "cheque" && chequeStatus);

export async function confirmSaleTransactionWithFallback(
    params: ConfirmSaleTransactionParams
): Promise<ConfirmSaleTransactionResult> {
    const chequeStatus = !!params.chequeStatus;
    const payload = {
        p_organization_id: params.organizationId,
        p_buyer_id: params.buyerId,
        p_sale_date: params.saleDate,
        p_payment_mode: params.paymentMode,
        p_total_amount: params.totalAmount,
        p_items: params.items,
        p_market_fee: params.marketFee || 0,
        p_nirashrit: params.nirashrit || 0,
        p_misc_fee: params.miscFee || 0,
        p_loading_charges: params.loadingCharges || 0,
        p_unloading_charges: params.unloadingCharges || 0,
        p_other_expenses: params.otherExpenses || 0,
        p_amount_received: params.amountReceived ?? 0,
        p_idempotency_key: params.idempotencyKey || null,
        p_due_date: params.dueDate || null,
        p_bank_account_id: params.bankAccountId || null,
        p_cheque_no: params.chequeNo || null,
        p_cheque_date: params.chequeDate || null,
        p_cheque_status: !!params.chequeStatus,
        p_bank_name: params.bankName || null,
        p_cgst_amount: params.cgstAmount || 0,
        p_sgst_amount: params.sgstAmount || 0,
        p_igst_amount: params.igstAmount || 0,
        p_gst_total: params.gstTotal || 0,
        p_discount_percent: params.discountPercent || 0,
        p_discount_amount: params.discountAmount || 0,
        p_place_of_supply: params.placeOfSupply || null,
        p_buyer_gstin: params.buyerGstin || null,
        p_is_igst: params.isIgst || false,
    };

    // FIX: Call the mandi schema version which has all parameters
    // (The public wrapper has fewer parameters and causes API key mismatch)
    const response = await supabase
        .schema("mandi")
        .rpc("confirm_sale_transaction", payload);

    return {
        data: response.data,
        error: response.error,
        usedLegacyFallback: false
    };
}
