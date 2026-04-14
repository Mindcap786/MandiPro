import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import NewPattiFormContent from './PageClient';

export const dynamic = 'force-dynamic';

export default function NewPattiPage() {
    return (
        <Suspense fallback={
            <div className="p-10 text-center animate-pulse font-black text-gray-500 uppercase tracking-widest">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-[#00b7ff]" />
                Initializing Settlement Workspace...
            </div>
        }>
            <NewPattiFormContent />
        </Suspense>
    );
}
