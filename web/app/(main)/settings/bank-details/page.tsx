'use client'

import PaymentDetailsSettings from '@/components/settings/payment-details-settings'
import { QrCode } from 'lucide-react'

export default function BankDetailsPage() {
    return (
        <div className="min-h-screen bg-slate-50 p-8 pb-32">
            <div className="max-w-xl mx-auto space-y-6">
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <h1 className="text-3xl font-[1000] tracking-tighter text-black uppercase flex items-center gap-3">
                        <QrCode className="w-8 h-8 text-violet-600" />
                        Bank <span className="text-violet-600">Details</span>
                    </h1>
                    <p className="text-slate-500 font-bold mt-1 text-sm">
                        Configure UPI & bank account to print on invoices.
                    </p>
                </div>
                <PaymentDetailsSettings />
            </div>
        </div>
    )
}
