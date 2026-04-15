import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import SalesOrdersNewPageClient from "./PageClient";

export const dynamic = 'force-dynamic';

export default function NewSalesOrderPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
            </div>
        }>
            <SalesOrdersNewPageClient />
        </Suspense>
    );
}
