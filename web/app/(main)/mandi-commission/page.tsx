import { MandiCommissionForm } from "@/components/mandi-commission/mandi-commission-form";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Mandi Commission | MandiPro",
    description: "Single-screen purchase and sale for Mandi Commission Agents",
};

export default function MandiCommissionPage() {
    return (
        <div className="container mx-auto px-4 py-8">
             <MandiCommissionForm />
        </div>
    );
}
