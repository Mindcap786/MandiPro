import { Suspense } from 'react';
import AuthCallback from './PageClient';

export const dynamic = 'force-dynamic';

export default function AuthCallbackPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-[#050510]">
                <div className="w-12 h-12 border-4 border-neon-green/30 border-t-neon-green rounded-full animate-spin" />
            </div>
        }>
            <AuthCallback />
        </Suspense>
    );
}
