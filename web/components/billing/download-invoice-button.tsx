"use client";

import { useState } from 'react';
import { Loader2, Download } from 'lucide-react';
import { useAuth } from '@/components/auth/auth-provider';
import { useLanguage } from '@/components/i18n/language-provider';

export default function DownloadInvoiceButton({ sale, organization }: { sale: any, organization?: any }) {
    const auth = useAuth?.();
    const profile = auth?.profile;
    const { t } = useLanguage();
    const [isGenerating, setIsGenerating] = useState(false);

    const org = organization || profile?.organization || {
        name: "Mandi Organization",
        city: "Main Market Yard"
    };

    const displayBillNo = sale.contact_bill_no || sale.bill_no;
    const filename = `Invoice-${displayBillNo}.pdf`;

    const handleDownload = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (isGenerating) return;

        try {
            setIsGenerating(true);
            const { generateInvoicePDF } = await import('@/lib/generate-invoice-pdf');
            const { downloadBlob } = await import('@/lib/capacitor-share');
            const blob = await generateInvoicePDF(sale, org);
            await downloadBlob(blob, filename);
        } catch (err: any) {
            console.error('[Download] PDF failed:', err);
            alert(`Failed to generate PDF: ${err?.message || err}`);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div onClick={handleDownload} className="flex items-center w-full cursor-pointer hover:bg-slate-50 px-2 py-1.5 rounded-lg transition-colors group">
            {isGenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin text-blue-600" />
            ) : (
                <Download className="w-4 h-4 mr-2 text-blue-600 group-hover:scale-110 transition-transform" />
            )}
            <span className="text-sm font-bold text-slate-700">
                {isGenerating ? t('common.loading') : t('common.download')}
            </span>
        </div>
    );
}
