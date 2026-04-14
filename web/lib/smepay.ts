/**
 * SME Pay Payment Gateway Integration
 * Handles authentication, order creation, and payment initiation
 */

// SMEPay V2 Standard: Staging (test) and Extranet (live)
const SMEPAY_BASE_URL = 
  process.env.SMEPAY_ENVIRONMENT === 'live' 
    ? 'https://extranet.smepay.in' 
    : 'https://staging.smepay.in';

const SMEPAY_CLIENT_ID = process.env.SMEPAY_CLIENT_ID!;
const SMEPAY_CLIENT_SECRET = process.env.SMEPAY_CLIENT_SECRET!;

// In-memory token cache (server-side only)
let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getSmepayToken(): Promise<string> {
    // Return cached token if still valid (with 30s buffer)
    if (cachedToken && Date.now() < cachedToken.expiresAt - 30000) {
        return cachedToken.token;
    }

    const res = await fetch(`${SMEPAY_BASE_URL}/api/external/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: SMEPAY_CLIENT_ID,
            client_secret: SMEPAY_CLIENT_SECRET,
        }),
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`SME Pay auth failed: ${res.status} - ${errBody}`);
    }

    const data = await res.json();
    cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in || 600) * 1000,
    };

    return cachedToken.token;
}

export interface SmepayOrderRequest {
    amount: string;
    orderId: string;
    callbackUrl: string;
    customerEmail: string;
    customerName: string;
    customerMobile?: string;
}

export interface SmepayOrderResponse {
    status: boolean;
    order_id: string;
    slug: string;
    message: string;
}

export async function createSmepayOrder(params: SmepayOrderRequest): Promise<SmepayOrderResponse> {
    const token = await getSmepayToken();

    const res = await fetch(`${SMEPAY_BASE_URL}/api/external/order/create`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
            client_id: SMEPAY_CLIENT_ID,
            amount: params.amount,
            order_id: params.orderId,
            callback_url: params.callbackUrl,
            customer_details: {
                email: params.customerEmail,
                mobile: params.customerMobile || '',
                name: params.customerName,
            },
        }),
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`SME Pay order creation failed: ${res.status} - ${errBody}`);
    }

    return res.json();
}

export interface SmepayInitiateResponse {
    status: boolean;
    order_id: string;
    external_reference_id: string;
    provider: string;
    payment_link: string;
    payment_url?: string;
    transaction_id: string;
    qr_code: string;
    payment_status: string;
    expires_at: number;
    intents: {
        gpay?: string;
        phonepe?: string;
        paytm?: string;
    };
    message: string;
}

export async function initiateSmepayPayment(slug: string): Promise<SmepayInitiateResponse> {
    const token = await getSmepayToken();

    const res = await fetch(`${SMEPAY_BASE_URL}/api/external/order/initiate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
            slug,
            client_id: SMEPAY_CLIENT_ID,
        }),
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`SME Pay payment initiation failed: ${res.status} - ${errBody}`);
    }

    return res.json();
}

export interface SmepayValidateResponse {
    status: boolean;
    order_id: string;
    external_reference_id: string;
    payment_status: string;
    amount: string;
    transaction_id?: string;
    message?: string;
}

export async function validateSmepayOrder(orderId: string): Promise<SmepayValidateResponse> {
    const token = await getSmepayToken();

    const res = await fetch(`${SMEPAY_BASE_URL}/api/external/order/validate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
            client_id: SMEPAY_CLIENT_ID,
            order_id: orderId,
        }),
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`SME Pay validation failed: ${res.status} - ${errBody}`);
    }

    return res.json();
}
