import { BulkLotSaleForm } from "@/components/sales/bulk-sale-form";

export const metadata = {
    title: "Bulk Distribution | MandiGrow",
};

export default function BulkSalePage() {
    return (
        <div className="flex-1 space-y-4 p-8 pt-6 bg-slate-50/30 min-h-screen">
            <BulkLotSaleForm />
        </div>
    );
}
