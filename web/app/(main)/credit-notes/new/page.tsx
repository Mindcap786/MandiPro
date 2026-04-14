import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import NewCreditNote from './PageClient';

export const dynamic = 'force-dynamic';

export default function NewCreditNotePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
        }>
            <NewCreditNote />
        </Suspense>
    );
}
