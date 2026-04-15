import { BulkLotSaleForm } from "@/components/sales/bulk-sale-form";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Bulk Lot Distribution | MandiGrow",
    description: "Distribute a single lot across multiple customers instantly.",
};

export default function BulkSalePage() {
    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <BulkLotSaleForm />
        </div>
    );
}
