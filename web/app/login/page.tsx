import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import LoginClient from './PageClient';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-[#dce7c8]">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
        }>
            <LoginClient />
        </Suspense>
    );
}
