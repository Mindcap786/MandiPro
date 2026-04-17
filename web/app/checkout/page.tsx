import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import Checkout from './CheckoutClient';

export const dynamic = 'force-dynamic';

export default function CheckoutPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
        }>
            <Checkout />
        </Suspense>
    );
}
