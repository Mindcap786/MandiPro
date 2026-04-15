import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import MenuPageClient from "./PageClient";

export const dynamic = 'force-dynamic';

export default function MenuPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
        }>
            <MenuPageClient />
        </Suspense>
    );
}
