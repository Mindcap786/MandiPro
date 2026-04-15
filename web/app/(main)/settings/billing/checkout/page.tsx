import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { ProtectedRoute } from '@/components/protected-route';
import CheckoutContent from './PageClient';

export const dynamic = 'force-dynamic';

export default function CheckoutPage() {
    return (
        <ProtectedRoute requiredPermission="manage_settings">
            <Suspense fallback={
                <div className="flex justify-center items-center h-screen">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                </div>
            }>
                <CheckoutContent />
            </Suspense>
        </ProtectedRoute>
    );
}
