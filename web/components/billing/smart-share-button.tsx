"use client";

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useState } from 'react';
import { Loader2, Share2, Mail, MessageCircle, Download } from 'lucide-react';
import { useAuth } from '@/components/auth/auth-provider';
import { useLanguage } from '@/components/i18n/language-provider';
import { isNativePlatform } from '@/lib/capacitor-utils';

export default function SmartShareButton({ sale, organization }: { sale: any, organization?: any }) {
    const auth = useAuth?.();
    const profile = auth?.profile;
    const { t } = useLanguage();
    const [loadingId, setLoadingId] = useState<string | null>(null);

    const org = organization || profile?.organization || {
        name: "Mandi Organization",
        city: "Main Market Yard"
    };

    const billNo = sale.contact_bill_no || sale.bill_no;
    const filename = `Invoice-${billNo}.pdf`;
    const amount = Number(sale.total_amount_inc_tax || sale.total_amount || 0).toLocaleString();
    const shareTitle = `Invoice #${billNo}`;
    const shareText = `Invoice #${billNo} - Rs.${amount} from ${org.name}`;

    const generatePDF = async () => {
        const { generateInvoicePDF } = await import('@/lib/generate-invoice-pdf');
        return generateInvoicePDF(sale, org);
    };

    // On native Capacitor: use the system share sheet directly (no dropdown needed)
    const handleNativeShare = async () => {
        if (loadingId) return;
        setLoadingId('native');
        try {
            const blob = await generatePDF();
            const { shareBlob } = await import('@/lib/capacitor-share');
            await shareBlob(blob, filename, { title: shareTitle, text: shareText });
        } catch (err: any) {
            if (err?.name === 'AbortError') return;
            console.error('[SmartShare] native failed:', err);
            alert(`Failed: ${err?.message || err}`);
        } finally {
            setLoadingId(null);
        }
    };

    const handleWhatsApp = async () => {
        if (loadingId) return;
        setLoadingId('whatsapp');
        try {
            const blob = await generatePDF();
            const { shareToWhatsApp } = await import('@/lib/capacitor-share');
            await shareToWhatsApp(blob, filename, shareText);
        } catch (err: any) {
            console.error('[SmartShare] WhatsApp failed:', err);
            alert(`Failed: ${err?.message || err}`);
        } finally {
            setLoadingId(null);
        }
    };

    const handleEmail = async () => {
        if (loadingId) return;
        setLoadingId('email');
        try {
            const blob = await generatePDF();
            const { downloadBlobSilent } = await import('@/lib/capacitor-share');
            // Trigger download in background — don't await so Mail opens immediately
            downloadBlobSilent(blob, filename);
            const subject = encodeURIComponent(shareTitle);
            const body = encodeURIComponent(
                `${shareText}\n\n` +
                `The invoice PDF (${filename}) has been saved to your Downloads folder.\n` +
                `Please attach it to this email before sending.`
            );
            window.location.href = `mailto:?subject=${subject}&body=${body}`;
        } catch (err: any) {
            console.error('[SmartShare] Email failed:', err);
            alert(`Failed: ${err?.message || err}`);
        } finally {
            setLoadingId(null);
        }
    };

    const handleDownload = async () => {
        if (loadingId) return;
        setLoadingId('download');
        try {
            const blob = await generatePDF();
            const { downloadBlob } = await import('@/lib/capacitor-share');
            await downloadBlob(blob, filename);
        } catch (err: any) {
            console.error('[SmartShare] Download failed:', err);
            alert(`Failed: ${err?.message || err}`);
        } finally {
            setLoadingId(null);
        }
    };

    const isLoading = loadingId !== null;

    // Native: single button → system share sheet
    if (isNativePlatform()) {
        return (
            <Button
                onClick={handleNativeShare}
                disabled={isLoading}
                variant="outline"
                size="sm"
                className="gap-2 border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50 text-emerald-700 font-bold h-10 shadow-sm"
            >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                {isLoading ? t('common.loading') : t('common.share')}
            </Button>
        );
    }

    // Web: dropdown share sheet — shown immediately so gesture is preserved
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    disabled={isLoading}
                    variant="outline"
                    size="sm"
                    className="gap-2 border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50 text-emerald-700 font-bold h-10 shadow-sm"
                >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                    {isLoading
                        ? (loadingId === 'whatsapp' ? 'Opening WhatsApp...'
                            : loadingId === 'email' ? 'Opening Mail...'
                            : loadingId === 'download' ? 'Downloading...'
                            : t('common.loading'))
                        : t('common.share')}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-white shadow-xl rounded-xl border-slate-200">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400">Share Invoice</DropdownMenuLabel>
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
