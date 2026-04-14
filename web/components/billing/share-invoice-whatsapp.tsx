"use client";

import { Share2, Loader2, MessageCircle, Mail, Download } from 'lucide-react';
import { useAuth } from '@/components/auth/auth-provider';
import { useState } from 'react';
import { useLanguage } from '@/components/i18n/language-provider';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isNativePlatform } from '@/lib/capacitor-utils';

export default function ShareInvoiceWhatsApp({ sale, organization }: { sale: any, organization?: any }) {
    const auth = useAuth?.();
    const profile = auth?.profile;
    const { t } = useLanguage();
    const [loadingId, setLoadingId] = useState<string | null>(null);

    const org = organization || profile?.organization || { name: "Mandi Organization", city: "Main Market Yard" };
    const displayBillNo = sale.contact_bill_no || sale.bill_no;
    const filename = `Invoice-${displayBillNo}.pdf`;
    const amount = Number(sale.total_amount_inc_tax || sale.total_amount || 0).toLocaleString();
    const shareTitle = `Invoice #${displayBillNo}`;
    const shareText = `Invoice #${displayBillNo} - Rs.${amount} from ${org.name}`;

    const generatePDF = async () => {
        const { generateInvoicePDF } = await import('@/lib/generate-invoice-pdf');
        return generateInvoicePDF(sale, org);
    };

    const handleNativeShare = async (e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (loadingId) return;
        setLoadingId('native');
        try {
            const blob = await generatePDF();
            const { shareBlob } = await import('@/lib/capacitor-share');
            await shareBlob(blob, filename, { title: shareTitle, text: shareText });
        } catch (err: any) {
            if (err?.name === 'AbortError') return;
            alert(`Failed: ${err?.message || err}`);
        } finally { setLoadingId(null); }
    };

    const handleWhatsApp = async () => {
        if (loadingId) return;
        setLoadingId('whatsapp');
        try {
            const blob = await generatePDF();
            const { shareToWhatsApp } = await import('@/lib/capacitor-share');
            await shareToWhatsApp(blob, filename, shareText);
        } catch (err: any) {
            alert(`Failed: ${err?.message || err}`);
        } finally { setLoadingId(null); }
    };

    const handleEmail = async () => {
        if (loadingId) return;
        setLoadingId('email');
        try {
            const blob = await generatePDF();
            const { downloadBlob } = await import('@/lib/capacitor-share');
            await downloadBlob(blob, filename);
            const subject = encodeURIComponent(shareTitle);
            const body = encodeURIComponent(`${shareText}\n\nPlease find the attached invoice PDF.`);
            setTimeout(() => { window.location.href = `mailto:?subject=${subject}&body=${body}`; }, 600);
        } catch (err: any) {
            alert(`Failed: ${err?.message || err}`);
        } finally { setLoadingId(null); }
    };

    const handleDownload = async () => {
        if (loadingId) return;
        setLoadingId('download');
        try {
            const blob = await generatePDF();
            const { downloadBlob } = await import('@/lib/capacitor-share');
            await downloadBlob(blob, filename);
        } catch (err: any) {
            alert(`Failed: ${err?.message || err}`);
        } finally { setLoadingId(null); }
    };

    const isLoading = loadingId !== null;

    // Native: single tap → system share sheet
    if (isNativePlatform()) {
        return (
            <div onClick={handleNativeShare} className="flex items-center w-full cursor-pointer hover:bg-slate-50 px-2 py-1.5 rounded-lg transition-colors group">
                {isLoading
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin text-emerald-600" />
                    : <Share2 className="w-4 h-4 mr-2 text-emerald-600 group-hover:scale-110 transition-transform" />}
                <span className="text-sm font-bold text-slate-700">
                    {isLoading ? 'Generating...' : t('common.share')}
                </span>
            </div>
        );
    }

    // Web: show share options dropdown immediately on click
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <div className="flex items-center w-full cursor-pointer hover:bg-slate-50 px-2 py-1.5 rounded-lg transition-colors group">
                    {isLoading
                        ? <Loader2 className="w-4 h-4 mr-2 animate-spin text-emerald-600" />
                        : <Share2 className="w-4 h-4 mr-2 text-emerald-600 group-hover:scale-110 transition-transform" />}
                    <span className="text-sm font-bold text-slate-700">
                        {isLoading
                            ? (loadingId === 'whatsapp' ? 'WhatsApp...' : loadingId === 'email' ? 'Mail...' : 'Downloading...')
                            : t('common.share')}
                    </span>
                </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 bg-white shadow-xl rounded-xl border-slate-200 z-50">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400">Share via</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    className="gap-2 cursor-pointer font-bold text-emerald-700 focus:bg-emerald-50"
                    onSelect={(e) => { e.preventDefault(); handleWhatsApp(); }}
                >
                    <MessageCircle className="w-4 h-4" /> WhatsApp
                </DropdownMenuItem>
                <DropdownMenuItem
                    className="gap-2 cursor-pointer font-bold text-blue-700 focus:bg-blue-50"
                    onSelect={(e) => { e.preventDefault(); handleEmail(); }}
                >
                    <Mail className="w-4 h-4" /> Email
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    className="gap-2 cursor-pointer font-bold text-slate-700 focus:bg-slate-50"
                    onSelect={(e) => { e.preventDefault(); handleDownload(); }}
                >
                    <Download className="w-4 h-4" /> Download PDF
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
