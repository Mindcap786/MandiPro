import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import Join from './JoinClient';

export const dynamic = 'force-dynamic';

export default function JoinPage() {
    return (
        <Suspense fallback={
            <div className="h-screen flex items-center justify-center bg-[#050510]">
                <Loader2 className="animate-spin text-neon-blue w-8 h-8" />
            </div>
        }>
            <Join />
        </Suspense>
    );
}
