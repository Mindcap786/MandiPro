import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import SalesNewPageClient from "./SalesNewPageClient";

export const dynamic = 'force-dynamic';

export default function SalesNewPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        }>
            <SalesNewPageClient />
        </Suspense>
    );
}
