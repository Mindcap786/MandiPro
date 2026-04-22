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
    vehicleNumber?: string | null;
    bookNo?: string | null;
    lotNo?: string | null;
};

type ConfirmSaleTransactionResult = {
    data: any;
    error: any;
    warning?: string;
};

export async function confirmSaleTransactionWithFallback(
    params: ConfirmSaleTransactionParams
): Promise<ConfirmSaleTransactionResult> {
    
    // Validate organizationId is a valid UUID
    if (!params.organizationId || typeof params.organizationId !== 'string') {
        return {
            data: null,
            error: { message: 'Invalid organization ID' }
        };
    }

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
        p_idempotency_key: params.idempotencyKey,
        p_due_date: params.dueDate,
        p_bank_account_id: params.bankAccountId,
        p_cheque_no: params.chequeNo,
        p_cheque_date: params.chequeDate,
        p_cheque_status: params.chequeStatus || false,
        p_bank_name: params.bankName,
        p_cgst_amount: params.cgstAmount || 0,
        p_sgst_amount: params.sgstAmount || 0,
        p_igst_amount: params.igstAmount || 0,
        p_gst_total: params.gstTotal || 0,
        p_discount_percent: params.discountPercent || 0,
        p_discount_amount: params.discountAmount || 0,
        p_place_of_supply: params.placeOfSupply,
        p_buyer_gstin: params.buyerGstin,
        p_is_igst: params.isIgst || false,
        p_vehicle_number: params.vehicleNumber,
        p_book_no: params.bookNo,
        p_lot_no: params.lotNo,
    };

    // 15-second timeout guard — prevents infinite spinners if DB hangs
    const timeoutPromise = new Promise<ConfirmSaleTransactionResult>((_, reject) =>
        setTimeout(() => reject(new Error('Sale request timed out after 15 seconds. Please retry.')), 15000)
    );

    const rpcPromise = supabase
        .schema("mandi")
        .rpc("confirm_sale_transaction", payload)
        .then(response => {
            // CRITICAL: Handle application-level errors returned inside data.error
            // (e.g. { success: false, error: "No items provided" })
            if (response.error) {
                return { data: null, error: response.error };
            }
            if (response.data && response.data.success === false) {
                return { data: null, error: { message: response.data.error || 'Transaction failed on the server.' } };
            }
            // Extract warning if present (e.g. partial stock)
            const warning = response.data?.warning || undefined;
            return { data: response.data, error: null, warning };
        });

    return Promise.race([rpcPromise, timeoutPromise]);
}