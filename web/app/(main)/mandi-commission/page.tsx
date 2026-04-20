import { MandiCommissionForm } from "@/components/mandi-commission/mandi-commission-form";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Purchase + Sale | MandiPro",
    description: "Single-screen purchase and sale entry for mandi workflows",
};

export default function MandiCommissionPage() {
    return (
        <div className="container mx-auto px-4 py-8">
             <MandiCommissionForm />
        </div>
    );
}
