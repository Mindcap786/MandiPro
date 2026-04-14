import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import CreditNotes from './PageClient';

export const dynamic = 'force-dynamic';

export default function CreditNotesPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#0C831F]" />
            </div>
        }>
            <CreditNotes />
        </Suspense>
    );
}
